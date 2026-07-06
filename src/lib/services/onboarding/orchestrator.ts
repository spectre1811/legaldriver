import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { getCourtDataClient } from "@/lib/court/client";
import { getCaseCached } from "@/lib/court/gateway";
import { upsertCase } from "@/lib/court/sync";
import { corpusEnabled, searchCasesByAdvocate } from "@/lib/court/corpus-athena";
import type { FetchedAdvocateCase } from "@/lib/court/advocate-cases";
import {
  driveDrain, enrichChunk, normalizeCounts, emptyCounts, DRAIN_BUDGET_MS,
  type OnboardingCounts, type DrainState, type StepFn,
} from "./drain";

type DB = SupabaseClient<Database>;
type Json = Database["public"]["Tables"]["onboarding_run"]["Update"]["counts"];

// Re-export the bits external callers (actions.ts) reach through the orchestrator.
export { DRAIN_BUDGET_MS, type OnboardingCounts } from "./drain";

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

const LOOKAHEAD_DAYS = 7;
// Upper bound on per-CNR live enrichment per run (the chunker walks this set ENRICH_CHUNK at a time).
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

// ── The IO context a stage handler needs. Resolved once per drain invocation. ──
interface StageCtx {
  supabase: DB;
  admin: DB;
  tenantId: string;
  advocateId: string;
  adv: { id: string; name: string; bar_registration_number: string | null; bar_code: string | null; state_code: string | null };
}

// Stage 1: cause-list seed (the only compliant per-advocate open-case signal).
async function stepCauselist(ctx: StageCtx, counts: OnboardingCounts): Promise<OnboardingCounts> {
  const { supabase, tenantId, adv } = ctx;
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
  return counts;
}

// Stage 1b: AUTO-FETCH the advocate's cases by name from compliant sources. Returns the honest fetch
// note (WO-58) + the cursor's fetch_pending flags so the UI can say "still fetching…".
async function stepFetch(ctx: StageCtx, counts: OnboardingCounts, cursor: Record<string, unknown>): Promise<{ counts: OnboardingCounts; cursor: Record<string, unknown>; message: string | null }> {
  const { supabase, tenantId, adv } = ctx;
  let fetchNote: string | null = null;
  const nextCursor: Record<string, unknown> = { ...cursor };
  const { enabledAdvocateProviders, fetchAdvocateCasesWithMeta, startLiveAdvocateRefresh } = await import("@/lib/court/advocate-cases");
  const advQ = { name: adv.name, barNumber: adv.bar_registration_number, stateCode: adv.state_code };
  if (enabledAdvocateProviders().length === 0) {
    // Honest, actionable — never imply the advocate simply has no cases when NO source is configured.
    fetchNote = "Court-data source isn’t configured here, so cases can’t be auto-fetched (an administrator must set LD_API_KEY). Your cause list and add-by-CNR still work.";
  } else {
    try {
      const { cases, errors } = await fetchAdvocateCasesWithMeta({ ...advQ, live: true });
      counts.cases_fetched += await seedFetchedMatters(supabase, tenantId, cases);
      // Fire the LIVE roster refresh (async, off-box fleet — never bursts the box EIP). It returns no
      // cases now; the fleet ingests the full roster into our warehouse, harvested below/on poll.
      const livePending = startLiveAdvocateRefresh({ ...advQ, live: true });
      if (livePending) { nextCursor.fetch_pending = true; nextCursor.fetch_started_at = new Date().toISOString(); }
      if (errors.length) {
        // Do NOT swallow (senior-engineer reflex §12): name the sources that failed (source names only, no PII).
        fetchNote = `Some court-data sources didn’t respond (${errors.map((e) => e.source).join(", ")}) — we’ll keep trying in the background.`;
      } else if (counts.cases_fetched === 0 && livePending) {
        fetchNote = "Fetching your cases from the court record — this can take a moment; they’ll appear as they arrive.";
      }
    } catch (e) {
      fetchNote = `Couldn’t auto-fetch cases (${e instanceof Error ? e.message : "unexpected error"}). Your cause list and add-by-CNR still work.`;
    }
  }
  return { counts, cursor: nextCursor, message: fetchNote };
}

// Stage 2: per-CNR enrich → upsertCase (puts hearings on calendar + reminders). CHUNKED (BP-73): the
// full CNR set is captured in the cursor on first entry, then processed ENRICH_CHUNK at a time so no
// single invocation runs all the LIVE read-throughs at once (60s-cap safety + pacing the source).
async function stepEnrich(ctx: StageCtx, counts: OnboardingCounts, cursor: Record<string, unknown>): Promise<{ counts: OnboardingCounts; cursor: Record<string, unknown>; more: boolean }> {
  const { supabase, tenantId } = ctx;
  const court = getCourtDataClient();

  // Capture a STABLE ordered CNR list on first entry (subsequent chunks read it from the cursor).
  let cnrs = Array.isArray(cursor.enrich_cnrs) ? (cursor.enrich_cnrs as string[]) : null;
  if (!cnrs) {
    const { data: matters } = await supabase.from("matter").select("cnr").eq("tenant_id", tenantId).eq("status", "active").not("cnr", "is", null).order("created_at", { ascending: true }).limit(ENRICH_CAP);
    cnrs = (matters ?? []).map((m) => m.cnr).filter((c): c is string => !!c);
  }
  const offset = typeof cursor.enrich_offset === "number" ? cursor.enrich_offset : 0;
  const { chunk, nextOffset, more } = enrichChunk(cnrs, offset);

  if (chunk.length > 0) {
    let live: Awaited<ReturnType<typeof court.refreshCases>> = [];
    try {
      live = await court.refreshCases(chunk); // LIVE eCourts read-through for this chunk only
    } catch { /* live refresh unavailable → cached fallback below */ }
    const liveCnrs = new Set(live.map((c) => c.cnr));
    for (const c of live) {
      try { await upsertCase(supabase, tenantId, c); counts.enriched++; } catch { /* skip one */ }
    }
    for (const cnr of chunk) {
      if (liveCnrs.has(cnr)) continue; // already live-refreshed above
      try {
        const res = await getCaseCached(cnr);
        if (res.case) { await upsertCase(supabase, tenantId, res.case); counts.enriched++; }
      } catch { /* keep going; stays at cause-list depth, flagged for HITL */ }
    }
  }
  return { counts, cursor: { ...cursor, enrich_cnrs: cnrs, enrich_offset: nextOffset }, more };
}

// Stage 3: propose deadlines from jurisdiction rules (human confirms). Recomputed idempotently.
async function stepDeadlines(ctx: StageCtx, counts: OnboardingCounts): Promise<OnboardingCounts> {
  try {
    const { materializeDeadlines } = await import("./deadlines");
    counts.deadlines_proposed = await materializeDeadlines(ctx.supabase, ctx.tenantId);
  } catch { /* deadline proposals are best-effort */ }
  return counts;
}

// Stage 4: inbox backfill (only if a Gmail account is connected) + Stage 3b orphan-doc auto-attach.
async function stepInbox(ctx: StageCtx, counts: OnboardingCounts): Promise<OnboardingCounts> {
  const { supabase, admin, tenantId } = ctx;
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

  // Stage 3b: auto-attach orphan docs to the now-seeded matters (CNR/parties).
  try {
    const { sweepOrphanDocuments } = await import("@/lib/docs/attach");
    counts.docs_attached = await sweepOrphanDocuments(supabase, tenantId);
  } catch { /* best-effort */ }
  return counts;
}

// Stage 4b: closed cases + judgments by advocate NAME (open corpus, partial).
async function stepClosed(ctx: StageCtx, counts: OnboardingCounts): Promise<OnboardingCounts> {
  if (corpusEnabled() && ctx.adv.name) {
    try { counts.closed_found = (await searchCasesByAdvocate(ctx.adv.name, 100)).length; } catch { /* corpus optional */ }
  }
  return counts;
}

// Stage 5: queue AI briefings — the worker generates for any matter with a null ai_summary
// (status-agnostic), so count those to mirror what it will do.
async function stepSummaries(ctx: StageCtx, counts: OnboardingCounts): Promise<OnboardingCounts> {
  const { count } = await ctx.supabase.from("matter").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).is("ai_summary", null);
  counts.summaries_queued = count ?? 0;
  return counts;
}

// Dispatch one stage to its IO handler and normalize to a StepResult for the driver.
function makeStep(ctx: StageCtx): StepFn {
  return async (stage, state) => {
    const counts = state.counts;
    switch (stage) {
      case "causelist": return { counts: await stepCauselist(ctx, counts), cursor: state.cursor, more: false };
      case "fetch": {
        const r = await stepFetch(ctx, counts, state.cursor);
        return { counts: r.counts, cursor: r.cursor, more: false, message: r.message };
      }
      case "enrich": return await stepEnrich(ctx, counts, state.cursor);
      case "deadlines": return { counts: await stepDeadlines(ctx, counts), cursor: state.cursor, more: false };
      case "inbox": return { counts: await stepInbox(ctx, counts), cursor: state.cursor, more: false };
      case "closed": return { counts: await stepClosed(ctx, counts), cursor: state.cursor, more: false };
      case "summaries": return { counts: await stepSummaries(ctx, counts), cursor: state.cursor, more: false };
      default: return { counts, cursor: state.cursor, more: false }; // unknown → advance
    }
  };
}

// ── Resume (or start) an onboarding run, doing bounded work then returning. ──
// Loads the run, resolves the advocate, and drives stages forward from the persisted `stage`+`cursor`
// until either `done` or the wall-clock budget is spent — persisting after every unit so a return (or a
// platform kill) is always resumable. Idempotent + safe to call repeatedly (that's exactly how the
// client poll + the cron backstop finish a large roster). Deterministic clock injectable for tests.
export async function drainOnboarding(
  supabase: DB,
  admin: DB,
  runId: string,
  opts?: { budgetMs?: number; now?: () => number },
): Promise<{ stage: string; done: boolean; counts: OnboardingCounts }> {
  const budgetMs = opts?.budgetMs ?? DRAIN_BUDGET_MS;
  const now = opts?.now ?? (() => Date.now());

  const { data: run } = await supabase.from("onboarding_run").select("advocate_id, stage, status, counts, cursor, message").eq("id", runId).maybeSingle();
  if (!run) return { stage: "error", done: false, counts: emptyCounts() };
  if (run.status === "done" || run.status === "error" || run.stage === "done") {
    return { stage: run.stage, done: run.stage === "done", counts: normalizeCounts(run.counts) };
  }

  const { data: adv } = await supabase.from("advocate").select("id, name, bar_registration_number, bar_code, state_code").eq("id", run.advocate_id ?? "").maybeSingle();
  if (!adv) {
    await setRun(supabase, runId, { stage: "error", status: "error", message: "Advocate not found." });
    return { stage: "error", done: false, counts: normalizeCounts(run.counts) };
  }

  // Resolve tenant from the run row (RLS already scopes it) so the drain is self-sufficient from runId.
  const { data: runTenant } = await supabase.from("onboarding_run").select("tenant_id").eq("id", runId).maybeSingle();
  const tenantId = runTenant?.tenant_id;
  if (!tenantId) return { stage: run.stage, done: false, counts: normalizeCounts(run.counts) };

  const ctx: StageCtx = { supabase, admin, tenantId, advocateId: adv.id, adv };
  const initial: DrainState = {
    stage: run.stage,
    cursor: (run.cursor ?? {}) as Record<string, unknown>,
    counts: normalizeCounts(run.counts),
    message: run.message ?? null,
  };

  const { state, done } = await driveDrain(initial, makeStep(ctx), {
    budgetMs,
    now,
    persist: async (s, isDone) => {
      await setRun(supabase, runId, {
        stage: s.stage,
        counts: s.counts,
        cursor: s.cursor,
        message: s.message,
        ...(isDone ? { status: "done" } : {}),
      });
    },
  });

  return { stage: state.stage, done, counts: state.counts };
}

// Back-compat: run an onboarding to completion in one call (unbounded budget). Kept for callers/tests
// that want the whole pipeline synchronously (e.g. a cron full-drain). The interactive path uses the
// bounded `drainOnboarding` instead so it never trips Vercel Hobby's 60s cap.
export async function runOnboarding(
  supabase: DB,
  admin: DB,
  opts: { tenantId: string; advocateId: string; runId: string },
): Promise<OnboardingCounts> {
  const res = await drainOnboarding(supabase, admin, opts.runId, { budgetMs: Number.POSITIVE_INFINITY });
  return res.counts;
}
