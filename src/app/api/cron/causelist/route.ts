import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCourtDataClient } from "@/lib/court/client";
import type { Database } from "@/lib/db/database.types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LOOKAHEAD_DAYS = 7;

function isoIn(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Daily cause-list pull. For each advocate, fetch the next N days' cause list,
// upsert cause_list_entry, and link to a tracked matter by CNR where possible.
// Unmatched entries surface on the calendar as "listed but not tracked".
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const court = getCourtDataClient();

  const { data: advocates, error } = await supabase
    .from("advocate")
    .select("id, tenant_id, name, bar_registration_number, state_code");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let upserted = 0;
  let linked = 0;
  for (const adv of advocates ?? []) {
    for (let i = 0; i < LOOKAHEAD_DAYS; i++) {
      const date = isoIn(i);
      let items;
      try {
        items = await court.getCauseList({
          date,
          name: adv.name,
          barNumber: adv.bar_registration_number ?? undefined,
          stateCode: adv.state_code ?? undefined,
        });
      } catch {
        continue;
      }
      for (const item of items) {
        // Link to a tracked matter by CNR (tenant-scoped).
        let matterId: string | null = null;
        if (item.cnr) {
          const { data: m } = await supabase
            .from("matter")
            .select("id")
            .eq("tenant_id", adv.tenant_id)
            .eq("cnr", item.cnr)
            .maybeSingle();
          matterId = m?.id ?? null;
          if (matterId) linked++;
        }
        const { error: upErr } = await supabase.from("cause_list_entry").upsert(
          {
            tenant_id: adv.tenant_id,
            advocate_id: adv.id,
            list_date: item.listDate,
            court: item.court ?? null,
            item_no: item.itemNo ?? null,
            cnr: item.cnr ?? null,
            matter_id: matterId,
            raw: (item.raw ?? {}) as Database["public"]["Tables"]["cause_list_entry"]["Insert"]["raw"],
          },
          { onConflict: "tenant_id,advocate_id,list_date,item_no" },
        );
        if (!upErr) upserted++;
      }
    }
  }

  return NextResponse.json({ ok: true, source: court.source, advocates: advocates?.length ?? 0, upserted, linked });
}
