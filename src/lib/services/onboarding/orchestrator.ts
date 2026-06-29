import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { getCourtDataClient } from "@/lib/court/client";
import { getCaseCached } from "@/lib/court/gateway";
import { upsertCase } from "@/lib/court/sync";
import { corpusEnabled, searchCasesByAdvocate } from "@/lib/court/corpus-athena";

type DB = SupabaseClient<Database>;
type Json = Database["public"]["Tables"]["onboarding_run"]["Update"]["counts"];

export interface OnboardingCounts {
  causelist: number; matters_seeded: number; enriched: number;
  deadlines_proposed: number; inbox_filed: number; closed_found: number; summaries_queued: number;
}

const LOOKAHEAD_DAYS = 7;
const ENRICH_CAP = 25;

function isoIn(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function setRun(supabase: DB, runId: string, fields: { stage?: string; status?: string; counts?: OnboardingCounts; message?: string | null }) {
  await supabase.from("onboarding_run").update({
    ...(fields.stage ? { stage: fields.stage } : {}),
    ...(fields.status ? { status: fields.status } : {}),
    ...(fields.counts ? { counts: fields.counts as unknown as Json } : {}),
    ...(fields.message !== undefined ? { message: fields.message } : {}),
    updated_at: new Date().toISOString(),
  }).eq("id", runId);
}

// Resumable, idempotent onboarding. Deterministic stages run inline; AI summaries
// are left for the background worker (matters with null ai_summary). Re-running is
// safe: cause_list upserts, upsertCase is idempotent, inbox dedupes, summaries are
// worker-driven. Honest about the open-case approximation (cause-list + CNR + HITL).
export async function runOnboarding(
  supabase: DB,
  admin: DB,
  opts: { tenantId: string; advocateId: string; runId: string },
): Promise<OnboardingCounts> {
  const { tenantId, advocateId, runId } = opts;
  const counts: OnboardingCounts = { causelist: 0, matters_seeded: 0, enriched: 0, deadlines_proposed: 0, inbox_filed: 0, closed_found: 0, summaries_queued: 0 };

  const { data: adv } = await supabase.from("advocate").select("id, name, bar_registration_number, state_code").eq("id", advocateId).maybeSingle();
  if (!adv) { await setRun(supabase, runId, { stage: "error", status: "error", message: "Advocate not found." }); return counts; }

  // ── Stage 1: cause-list seed (the only compliant per-advocate open-case signal) ──
  await setRun(supabase, runId, { stage: "causelist" });
  const court = getCourtDataClient();
  const seenCnr = new Set<string>();
  for (let i = 0; i < LOOKAHEAD_DAYS; i++) {
    let items;
    try {
      items = await court.getCauseList({ date: isoIn(i), name: adv.name, barNumber: adv.bar_registration_number ?? undefined, stateCode: adv.state_code ?? undefined });
    } catch { continue; }
    for (const item of items) {
      counts.causelist++;
      let matterId: string | null = null;
      if (item.cnr) {
        const { data: m } = await supabase.from("matter").select("id").eq("tenant_id", tenantId).eq("cnr", item.cnr).maybeSingle();
        matterId = m?.id ?? null;
      }
      await supabase.from("cause_list_entry").upsert({
        tenant_id: tenantId, advocate_id: adv.id, list_date: item.listDate, court: item.court ?? null,
        item_no: item.itemNo ?? null, cnr: item.cnr ?? null, matter_id: matterId,
        raw: (item.raw ?? {}) as Database["public"]["Tables"]["cause_list_entry"]["Insert"]["raw"],
      }, { onConflict: "tenant_id,advocate_id,list_date,item_no" });
      // Seed a lightweight matter for a new CNR so it exists even if enrich can't fetch it.
      if (item.cnr && !matterId && !seenCnr.has(item.cnr)) {
        seenCnr.add(item.cnr);
        const { error } = await supabase.from("matter").insert({
          tenant_id: tenantId, cnr: item.cnr, title: item.title ?? item.cnr, status: "active", source: "causelist",
        });
        if (!error) counts.matters_seeded++;
      }
    }
  }
  await setRun(supabase, runId, { counts });

  // ── Stage 2: per-CNR enrich → upsertCase (puts hearings on calendar + reminders) ──
  await setRun(supabase, runId, { stage: "enrich" });
  const { data: matters } = await supabase.from("matter").select("cnr").eq("tenant_id", tenantId).eq("status", "active").not("cnr", "is", null).limit(ENRICH_CAP);
  for (const m of matters ?? []) {
    if (!m.cnr) continue;
    try {
      const res = await getCaseCached(m.cnr);
      if (res.case) { await upsertCase(supabase, tenantId, res.case); counts.enriched++; }
    } catch { /* keep going; stays at cause-list depth, flagged for HITL */ }
  }
  await setRun(supabase, runId, { counts });

  // ── Stage 3: propose deadlines from jurisdiction rules (human confirms) ──
  await setRun(supabase, runId, { stage: "deadlines" });
  try {
    const { materializeDeadlines } = await import("./deadlines");
    counts.deadlines_proposed = await materializeDeadlines(supabase, tenantId);
  } catch { /* deadline proposals are best-effort */ }
  await setRun(supabase, runId, { counts });

  // ── Stage 4: inbox backfill (only if a Gmail account is connected) ──
  await setRun(supabase, runId, { stage: "inbox" });
  try {
    const { googleConfigured, refreshAccessToken } = await import("@/lib/mail/oauth");
    if (googleConfigured()) {
      const { data: acct } = await admin.from("oauth_connection").select("id, user_id, refresh_token_ref").eq("tenant_id", tenantId).limit(1).maybeSingle();
      if (acct?.refresh_token_ref) {
        const { readSecret } = await import("@/lib/mail/vault");
        const { getGmailClient } = await import("@/lib/mail/client");
        const { ingestMail } = await import("@/lib/mail/ingest");
        const refresh = await readSecret(admin, acct.refresh_token_ref);
        if (refresh) {
          const accessToken = await refreshAccessToken(refresh);
          const mail = getGmailClient(accessToken);
          const summary = await ingestMail(admin, tenantId, acct.user_id, mail, null, 25);
          counts.inbox_filed = summary.filed ?? 0;
        }
      }
    }
  } catch { /* inbox is best-effort; never block onboarding */ }
  await setRun(supabase, runId, { counts });

  // ── Stage 4: closed cases + judgments by advocate NAME (open corpus, partial) ──
  await setRun(supabase, runId, { stage: "closed" });
  if (corpusEnabled() && adv.name) {
    try { counts.closed_found = (await searchCasesByAdvocate(adv.name, 100)).length; } catch { /* corpus optional */ }
  }
  await setRun(supabase, runId, { counts });

  // ── Stage 5: queue AI briefings — the worker generates for any matter with a
  // null ai_summary (status-agnostic), so count those to mirror what it will do. ──
  await setRun(supabase, runId, { stage: "summaries" });
  const { count } = await supabase.from("matter").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).is("ai_summary", null);
  counts.summaries_queued = count ?? 0;

  await setRun(supabase, runId, { stage: "done", status: "done", counts, message: null });
  return counts;
}
