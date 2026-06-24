import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCourtDataClient } from "@/lib/court/client";
import { upsertCase } from "@/lib/court/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Nightly case refresh. Vercel Cron hits this with `Authorization: Bearer <CRON_SECRET>`.
// Bulk-refreshes every tracked CNR per tenant (≤50/call), diffs into matter/hearing,
// and (in P2) will queue notifications on new hearing dates. Uses the service-role
// client (no user session) and scopes every write by tenant_id explicitly.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const court = getCourtDataClient();

  const { data: matters, error } = await supabase
    .from("matter")
    .select("id, cnr, tenant_id, next_hearing_date")
    .not("cnr", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Group CNRs by tenant.
  const byTenant = new Map<string, { id: string; cnr: string; next: string | null }[]>();
  for (const m of matters ?? []) {
    if (!m.cnr) continue;
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
        cases = await court.refreshCases(batch);
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

  return NextResponse.json({ ok: true, source: court.source, refreshed, changed });
}
