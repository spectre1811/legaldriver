import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCourtDataClient } from "@/lib/court/client";
import { refreshCasesCached } from "@/lib/court/gateway";
import { upsertCase } from "@/lib/court/sync";
import { orderForRefresh, type RefreshCandidate } from "@/lib/court/refresh-priority";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cap the number of cases refreshed per run to fit the maxDuration budget; the rest defer
// to the next run (stalest-first ordering rotates the tail forward). Tune via env.
const REFRESH_MAX_PER_RUN = Number(process.env.REFRESH_MAX_PER_RUN ?? "600");

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
  for (const [tenantId, list] of byTenant) {
    const prevByCnr = new Map(list.map((m) => [m.cnr.toUpperCase(), m.next]));
    for (let i = 0; i < list.length; i += 50) {
      const batch = list.slice(i, i + 50).map((m) => m.cnr);
      let cases;
      try {
        cases = await refreshCasesCached(batch); // through the gateway: writes cache + health
      } catch {
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
    considered: candidates.length, refreshed, changed, deferred,
  });
}
