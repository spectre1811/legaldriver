import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCourtDataClient } from "@/lib/court/client";
import { liveRefreshCase, refreshCasesCached } from "@/lib/court/gateway";
import { upsertCase } from "@/lib/court/sync";
import { orderForRefresh, type RefreshCandidate } from "@/lib/court/refresh-priority";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cap the number of cases refreshed per run to fit the maxDuration budget; the rest defer
// to the next run (stalest-first ordering rotates the tail forward). Tune via env.
const REFRESH_MAX_PER_RUN = Number(process.env.REFRESH_MAX_PER_RUN ?? "600");

// WO-286: the cached bulk path below NEVER triggers an eCourts scrape (provider GET is
// cache-first by design) — so the nightly run now spends a bounded budget doing REAL refreshes
// (provider POST /v1/cases/{cnr}/refresh via liveRefreshCase) on the highest-priority stale
// cases first, then falls back to the cached sync for the tail. A live refresh is seconds-per-
// case (live scrape), hence the small default cap + elapsed-time guard inside maxDuration=60.
// REFRESH_LIVE_MAX_PER_RUN=0 is the kill switch (byte-identical to the old behavior).
const REFRESH_LIVE_MAX_PER_RUN = Number(process.env.REFRESH_LIVE_MAX_PER_RUN ?? "8");
const REFRESH_LIVE_BUDGET_MS = Number(process.env.REFRESH_LIVE_BUDGET_MS ?? "35000");

// Nightly case refresh. Vercel Cron hits this with `Authorization: Bearer <CRON_SECRET>`.
// Refreshes tracked CNRs via the internal /v1 API (through the active CourtDataClient), in
// WATERMARK-AWARE priority: pending/urgent + stalest cases first, disposed last, capped to
// the time budget with the overflow deferred (never silently dropped). Uses the service-role
// client (no user session) and scopes every write by tenant_id explicitly.
export async function GET(request: NextRequest) {
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

  // Group the prioritized CNRs by tenant (insertion order preserves the priority ranking).
  const byTenant = new Map<string, { id: string; cnr: string; next: string | null }[]>();
  for (const m of ordered) {
    const list = byTenant.get(m.tenant_id) ?? byTenant.set(m.tenant_id, []).get(m.tenant_id)!;
    list.push({ id: m.id, cnr: m.cnr, next: m.next_hearing_date });
  }

  let refreshed = 0;
  let changed = 0;
  let failedBatches = 0;
  let liveRefreshed = 0;
  let liveFailed = 0;
  let liveLeft = Number.isFinite(REFRESH_LIVE_MAX_PER_RUN) ? Math.max(0, REFRESH_LIVE_MAX_PER_RUN) : 0;
  const liveT0 = Date.now();
  for (const [tenantId, list] of byTenant) {
    const prevByCnr = new Map(list.map((m) => [m.cnr.toUpperCase(), m.next]));

    // WO-286 live lane: consume from the head of the tenant's list (insertion order = priority
    // ranking) while global budget lasts. liveRefreshCase POSTs the provider's real /refresh,
    // falls back to the cached copy internally on provider miss/error (stale flag set). Rows we
    // live-handle are removed from `list` so the cached bulk path below only syncs the tail.
    while (liveLeft > 0 && list.length > 0 && Date.now() - liveT0 < REFRESH_LIVE_BUDGET_MS) {
      const m = list.shift()!;
      liveLeft--;
      try {
        const r = await liveRefreshCase(m.cnr);
        if (!r.case) { liveFailed++; continue; }
        if (r.stale) liveFailed++; else liveRefreshed++;
        await upsertCase(supabase, tenantId, r.case);
        refreshed++;
        const prevNext = prevByCnr.get(m.cnr.toUpperCase());
        if ((r.case.nextHearingDate ?? null) !== (prevNext ?? null)) {
          changed++;
          await supabase.from("audit_event").insert({
            tenant_id: tenantId,
            action: "case.hearing_changed",
            entity: "matter",
            after: { cnr: r.case.cnr, next_hearing_date: r.case.nextHearingDate, source: r.case.source },
          });
        }
      } catch {
        liveFailed++; // never let one live miss kill the run; tail still cached-syncs
      }
    }
    for (let i = 0; i < list.length; i += 50) {
      const batch = list.slice(i, i + 50).map((m) => m.cnr);
      let cases;
      try {
        cases = await refreshCasesCached(batch); // through the gateway: writes cache + health
      } catch {
        failedBatches++; // count skipped batches for observability (not silently swallowed)
        continue; // skip a failing batch; never throw the whole job
      }
      for (const c of cases) {
        await upsertCase(supabase, tenantId, c);
        refreshed++;
        const prevNext = prevByCnr.get(c.cnr.toUpperCase());
        if ((c.nextHearingDate ?? null) !== (prevNext ?? null)) {
          changed++;
          await supabase.from("audit_event").insert({
            tenant_id: tenantId,
            action: "case.hearing_changed",
            entity: "matter",
            after: { cnr: c.cnr, next_hearing_date: c.nextHearingDate, source: c.source },
          });
        }
      }
    }
  }

  return NextResponse.json({
    ok: true, source: court.source,
    considered: candidates.length, refreshed, changed, deferred, failedBatches,
    liveRefreshed, liveFailed, liveBudgetMs: REFRESH_LIVE_BUDGET_MS,
  });
}
