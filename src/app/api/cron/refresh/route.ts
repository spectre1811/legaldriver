import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCourtDataClient } from "@/lib/court/client";
import { liveRefreshCase, getCaseCached } from "@/lib/court/gateway";
import { orderForRefresh, type RefreshCandidate } from "@/lib/court/refresh-priority";
import { liveBudgetOpen, liveDeadlineMs, liveLaneSize, persistOne } from "@/lib/court/live-lane";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cap the number of cases refreshed per run to fit the maxDuration budget; the rest defer
// to the next run (stalest-first ordering rotates the tail forward). Tune via env.
// WO-286 W2: 600 never fit inside 60s (prod measured: 504 at the edge, 0 rows moved) — 100 does.
const REFRESH_MAX_PER_RUN = Number(process.env.REFRESH_MAX_PER_RUN ?? "100");

// WO-286: the cached path below never triggers an eCourts scrape (provider GET is cache-first by
// design) — so the nightly run spends a bounded budget doing REAL refreshes (provider POST
// /v1/cases/{cnr}/refresh via liveRefreshCase) on the highest-priority stale cases first, then
// STREAMS the cached-path refresh for the tail (persistOne persists each case the instant its own
// fetch resolves). REFRESH_LIVE_MAX_PER_RUN=0 is the kill switch (lane never runs).
// WO-286 W2: 8 slots × [1s,15s] never fit — a real live refresh takes 5-30s under eCourts WAF
// pacing, so most attempts deadlined out burning the budget for nothing. 3 slots × up to 25s
// (cumulative-capped by REFRESH_LIVE_BUDGET_MS below) gives a real scrape room to finish.
const REFRESH_LIVE_MAX_PER_RUN = liveLaneSize(process.env.REFRESH_LIVE_MAX_PER_RUN);
const REFRESH_LIVE_BUDGET_MS = Number(process.env.REFRESH_LIVE_BUDGET_MS ?? "25000");

// WO-286 W2 — the ≤55s latency budget (maxDuration=60s is Vercel's HARD kill; nothing below it
// may run past that wall):
//   • live lane FIRST: ≤3 real provider POST /refresh calls, cumulative-budget-capped at
//     REFRESH_LIVE_BUDGET_MS (25s) via liveBudgetOpen — worst case the lane burns ~25s, never
//     more, regardless of how slow any single call is (each call is ALSO deadline-capped to the
//     lane's own remaining budget via liveDeadlineMs, so one hung POST can't eat the whole 25s).
//   • cached tail STREAMS the rest: GET (cache-first) + upsert PER CASE, in the same priority
//     order, persisted the instant each one resolves (persistOne, src/lib/court/live-lane.ts) —
//     never collect-then-write, so a kill mid-run keeps every case it got to (this was root cause
//     (b) of the W1 prod 504/0-rows incident: the old path collected a whole batch's provider GETs
//     into an array before writing any of them). Wall-clock guarded at RUN_DEADLINE_MS so a slow
//     run degrades HONESTLY (hitDeadline + skipped in the summary) instead of riding the 60s hard
//     kill in silence.
//   • budget math: 25s (live) + up to ~30s (cached tail — REFRESH_MAX_PER_RUN=100 cache-first
//     GET+upsert cycles, each a fast internal-API read, not a live scrape) fits inside the 55s
//     soft deadline, leaving a ~5s margin to assemble the summary, write the health row, and
//     return the response before Vercel's own 60s kill.
const RUN_DEADLINE_MS = 55_000;

// Nightly case refresh. Vercel Cron hits this with `Authorization: Bearer <CRON_SECRET>`.
// Refreshes tracked CNRs via the internal /v1 API (through the active CourtDataClient), in
// WATERMARK-AWARE priority: pending/urgent + stalest cases first, disposed last, capped to
// the time budget with the overflow deferred (never silently dropped). Uses the service-role
// client (no user session) and scopes every write by tenant_id explicitly.
export async function GET(request: NextRequest) {
  const runStart = Date.now();
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const court = getCourtDataClient();

  const { data: matters, error } = await supabase
    .from("matter")
    .select("id, cnr, tenant_id, next_hearing_date, last_synced_at, status")
    .is("deleted_at", null) // service-role bypasses RLS — skip trashed matters (WO-43-W2 soft-delete)
    .not("cnr", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Watermark-aware priority: urgent/pending + stalest first, capped to the run budget.
  const candidates: RefreshCandidate[] = (matters ?? [])
    .filter((m) => !!m.cnr)
    .map((m) => ({
      id: m.id, cnr: m.cnr as string, tenant_id: m.tenant_id,
      next_hearing_date: m.next_hearing_date, last_synced_at: m.last_synced_at, status: m.status,
    }));
  const { ordered, deferred } = orderForRefresh(candidates, Date.now(), REFRESH_MAX_PER_RUN);

  let refreshed = 0;
  let changed = 0;
  let liveRefreshed = 0;
  let failed = 0;
  let skipped = deferred; // candidates the priority cap never even considered this run
  let hitDeadline = false;

  // Live lane: a PRE-PASS over `ordered` — the cross-tenant round-robin priority order — so the
  // GLOBAL top-K ranks get the live budget, not whichever tenant happens to come first in the
  // list. liveRefreshCase POSTs the provider's real /refresh (persistOne falls back to the cached
  // copy internally via liveRefreshCase's own stale-handling on a provider miss/error).
  const liveDone = new Set<RefreshCandidate>();
  let liveLeft = REFRESH_LIVE_MAX_PER_RUN;
  const liveT0 = Date.now();
  const withDeadline = <T,>(p: Promise<T>, ms: number): Promise<T> =>
    Promise.race([p, new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error("live-refresh deadline")), ms))]);
  for (const m of ordered) {
    if (!liveBudgetOpen(liveLeft, Date.now() - liveT0, REFRESH_LIVE_BUDGET_MS)) break;
    liveLeft--;
    liveDone.add(m);
    const { outcome, changed: didChange } = await persistOne(supabase, m, () =>
      withDeadline(liveRefreshCase(m.cnr), liveDeadlineMs(REFRESH_LIVE_BUDGET_MS, Date.now() - liveT0)),
    );
    if (outcome === "refreshed") { liveRefreshed++; refreshed++; } else { failed++; }
    if (didChange) changed++;
  }

  // Cached tail: STREAMS the remainder in the same global priority order — persistOne fetches
  // (cache-first, force:true) + upserts each case back-to-back, so a case persists the instant it
  // resolves (never collect-all-then-write). Wall-clock guarded so a slow run stops cleanly before
  // the 60s hard kill instead of silently losing whatever it hadn't gotten to yet.
  for (const m of ordered) {
    if (liveDone.has(m)) continue;
    if (Date.now() - runStart > RUN_DEADLINE_MS) { hitDeadline = true; skipped++; continue; }
    const { outcome, changed: didChange } = await persistOne(supabase, m, () => getCaseCached(m.cnr, { force: true }));
    if (outcome === "refreshed") refreshed++; else failed++;
    if (didChange) changed++;
  }

  const durationMs = Date.now() - runStart;
  const attempted = refreshed + failed;
  const summary = { considered: candidates.length, liveRefreshed, refreshed, changed, failed, skipped, durationMs, hitDeadline };

  // WO-286 W2 (f): run-outcome observability on the existing court_provider_health surface — the
  // SAME dead-man pattern as WO-288's email-sendpath / WO-63's deploy-freshness rows. Root cause
  // (c) was that the nightly refresh had been silently partial forever: nothing recorded what
  // actually happened. `last_error` here doubles as a compact run-summary string on EVERY run, not
  // just failures (the settings UI only renders last_error when !ok — the WO-288/WO-63 convention
  // — so a healthy run's summary sits invisible there but stays queryable for diagnostics). `ok`
  // folds in both signals this row can carry: didn't need to truncate for time, and didn't fail
  // every attempted case. There is no Vercel→GChat relay in-repo (per WO-288); the real GChat push
  // rides the shared WO-288 W2 bridge — this row is the honest interim signal.
  // hitDeadline is normal bounded behavior (recorded in the summary/last_error), NOT unhealthy — only a systemic failure (all attempts failed) flips ok.
  const ok = attempted === 0 || failed < attempted;
  try {
    await supabase.from("court_provider_health").upsert(
      {
        provider: "refresh-cron",
        ok,
        last_error: JSON.stringify(summary).slice(0, 200),
        ...(ok ? { last_ok_at: new Date().toISOString() } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider" },
    );
  } catch {
    // best-effort — the response JSON below still carries the honest summary
  }

  return NextResponse.json({ ok: true, source: court.source, ...summary, liveBudgetMs: REFRESH_LIVE_BUDGET_MS });
}
