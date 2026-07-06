import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { getCourtDataClient } from "@/lib/court/client";
import { getCaseCached } from "@/lib/court/gateway";
import { upsertCase } from "@/lib/court/sync";
import { corpusEnabled, searchCasesByAdvocate } from "@/lib/court/corpus-athena";
import type { FetchedAdvocateCase } from "@/lib/court/advocate-cases";

type DB = SupabaseClient<Database>;
type Json = Database["public"]["Tables"]["onboarding_run"]["Update"]["counts"];

// Seed tenant matters from fetched advocate cases (de-duped by CNR, else title). Returns how many NEW
// matters were inserted. Shared by the onboarding fetch stage AND the background harvest (WO-58), so the
// two paths seed identically. Idempotent: an already-present CNR/title is skipped, so re-runs are safe.
export async function seedFetchedMatters(supabase: DB, tenantId: string, fetched: FetchedAdvocateCase[], cap = 80): Promise<number> {
  let seeded = 0;
  for (const fc of fetched.slice(0, cap)) {
    if (fc.cnr) {
      const { data: ex } = await supabase.from("matter").select("id").eq("tenant_id", tenantId).eq("cnr", fc.cnr).maybeSingle();
      if (ex) continue;
    } else if (fc.title) {
      const { data: ex } = await supabase.from("matter").select("id").eq("tenant_id", tenantId).ilike("title", fc.title).maybeSingle();
      if (ex) continue;
    } else continue;
    const { error } = await supabase.from("matter").insert({
      tenant_id: tenantId, cnr: fc.cnr ?? null, title: fc.title || fc.caseNumber || fc.cnr || "Case",
      court: fc.court ?? null, status: fc.decided ? "disposed" : "active",
      next_hearing_date: fc.nextHearingDate ?? null, source: fc.source,
    });
    if (!error) seeded++;
  }
  return seeded;
}

export interface OnboardingCounts {
  causelist: number; cases_fetched: number; matters_seeded: number; enriched: number;
  deadlines_proposed: number; inbox_filed: number; docs_attached: number; closed_found: number; summaries_queued: number;
}

const LOOKAHEAD_DAYS = 7;
const ENRICH_CAP = 25;

function isoIn(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function setRun(supabase: DB, runId: string, fields: { stage?: string; status?: string; counts?: OnboardingCounts; message?: string | null; cursor?: Record<string, unknown> }) {
  await supabase.from("onboarding_run").update({
    ...(fields.stage ? { stage: fields.stage } : {}),
    ...(fields.status ? { status: fields.status } : {}),
    ...(fields.counts ? { counts: fields.counts as unknown as Json } : {}),
    ...(fields.cursor ? { cursor: fields.cursor as unknown as Json } : {}),
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
  const counts: OnboardingCounts = { causelist: 0, cases_fetched: 0, matters_seeded: 0, enriched: 0, deadlines_proposed: 0, inbox_filed: 0, docs_attached: 0, closed_found: 0, summaries_queued: 0 };

  const { data: adv } = await supabase.from("advocate").select("id, name, bar_registration_number, bar_code, state_code").eq("id", advocateId).maybeSingle();
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

  // ── Stage 1b: AUTO-FETCH the advocate's cases by name from compliant sources ──
  // WO-58: onboarding must NEVER be a silent blackhole. We surface the fetch outcome honestly on the
  // run: "no court-data source configured" (e.g. LD_API_KEY unset in this env) is NOT the same as "we
  // searched and you have none" — and a live async fetch that's still filling the warehouse is flagged
  // `fetch_pending` so the UI can say "still fetching…" and the harvest (actions.harvestOnboarding)
  // seeds the rest as the fleet lands them. `fetchNote` rides through to the terminal message.
  await setRun(supabase, runId, { stage: "fetch" });
  let fetchNote: string | null = null;
  const { enabledAdvocateProviders, fetchAdvocateCasesWithMeta, startLiveAdvocateRefresh } = await import("@/lib/court/advocate-cases");
  const advQ = { name: adv.name, barNumber: adv.bar_registration_number, stateCode: adv.state_code };
  if (enabledAdvocateProviders().length === 0) {
    // Honest, actionable — never imply the advocate simply has no cases when NO source is configured.
    fetchNote = "Court-data source isn’t configured here, so cases can’t be auto-fetched (an administrator must set LD_API_KEY). Your cause list and add-by-CNR still work.";
    await setRun(supabase, runId, { message: fetchNote });
  } else {
    try {
      const { cases, errors } = await fetchAdvocateCasesWithMeta({ ...advQ, live: true });
      counts.cases_fetched += await seedFetchedMatters(supabase, tenantId, cases);
      // Fire the LIVE roster refresh (async, off-box fleet — never bursts the box EIP). It returns no
      // cases now; the fleet ingests the full roster into our warehouse, harvested below/on poll.
      const livePending = startLiveAdvocateRefresh({ ...advQ, live: true });
      if (livePending) await setRun(supabase, runId, { cursor: { fetch_pending: true, fetch_started_at: new Date().toISOString() } });
      if (errors.length) {
        // Do NOT swallow (senior-engineer reflex §12): name the sources that failed (source names only, no PII).
        fetchNote = `Some court-data sources didn’t respond (${errors.map((e) => e.source).join(", ")}) — we’ll keep trying in the background.`;
      } else if (counts.cases_fetched === 0 && livePending) {
        fetchNote = "Fetching your cases from the court record — this can take a moment; they’ll appear as they arrive.";
      }
      if (fetchNote) await setRun(supabase, runId, { message: fetchNote });
    } catch (e) {
      fetchNote = `Couldn’t auto-fetch cases (${e instanceof Error ? e.message : "unexpected error"}). Your cause list and add-by-CNR still work.`;
      await setRun(supabase, runId, { message: fetchNote });
    }
  }
  await setRun(supabase, runId, { counts });

  // ── Stage 2: per-CNR enrich → upsertCase (puts hearings on calendar + reminders) ──
  // Onboarding pulls each case LIVE from the source (eCourts read-through via the
  // provider's refresh — POST /v1/cases/{cnr}/refresh) rather than serving our cache:
  // a one-time onboarding should reflect the CURRENT record, not a stale copy. If the
  // live refresh is unavailable (provider down / keyless), fall back to the cached read
  // per CNR so enrichment still runs (resilience model: never fail the whole onboarding).
  await setRun(supabase, runId, { stage: "enrich" });
  const { data: matters } = await supabase.from("matter").select("cnr").eq("tenant_id", tenantId).eq("status", "active").not("cnr", "is", null).limit(ENRICH_CAP);
  const enrichCnrs = (matters ?? []).map((m) => m.cnr).filter((c): c is string => !!c);
  let live: Awaited<ReturnType<typeof court.refreshCases>> = [];
  try {
    live = await court.refreshCases(enrichCnrs); // LIVE eCourts read-through
  } catch { /* live refresh unavailable → cached fallback below */ }
  const liveCnrs = new Set(live.map((c) => c.cnr));
  for (const c of live) {
    try { await upsertCase(supabase, tenantId, c); counts.enriched++; } catch { /* skip one */ }
  }
  for (const cnr of enrichCnrs) {
    if (liveCnrs.has(cnr)) continue; // already live-refreshed above
    try {
      const res = await getCaseCached(cnr);
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
      const { data: acct } = await admin.from("oauth_connection").select("id, user_id, refresh_token_ref, gmail_query").eq("tenant_id", tenantId).limit(1).maybeSingle();
      if (acct?.refresh_token_ref) {
        const { readSecret } = await import("@/lib/mail/vault");
        const { getGmailClient } = await import("@/lib/mail/client");
        const { ingestMail } = await import("@/lib/mail/ingest");
        const refresh = await readSecret(admin, acct.refresh_token_ref);
        if (refresh) {
          const accessToken = await refreshAccessToken(refresh);
          const mail = getGmailClient(accessToken, acct.gmail_query); // honor the connection's scope on backfill too (WO-29 W1b)
          const summary = await ingestMail(admin, tenantId, acct.user_id, mail, null, 25);
          counts.inbox_filed = summary.filed ?? 0;
        }
      }
    }
  } catch { /* inbox is best-effort; never block onboarding */ }
  await setRun(supabase, runId, { counts });

  // ── Stage 3b: auto-attach orphan docs to the now-seeded matters (CNR/parties) ──
  try {
    const { sweepOrphanDocuments } = await import("@/lib/docs/attach");
    counts.docs_attached = await sweepOrphanDocuments(supabase, tenantId);
  } catch { /* best-effort */ }
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

  // Keep the honest fetch note (e.g. "not configured" / "still fetching…") on the finished run so the
  // page explains a zero instead of showing a bare, misleading "0 cases". WO-58.
  await setRun(supabase, runId, { stage: "done", status: "done", counts, message: fetchNote });
  return counts;
}
