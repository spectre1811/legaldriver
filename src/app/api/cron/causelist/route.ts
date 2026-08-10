import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCourtDataClient } from "@/lib/court/client";
import type { Database } from "@/lib/db/database.types";
import { track } from "@/lib/analytics/track";
import { sizeBucket } from "@/lib/analytics/events";
import { withCronLock } from "@/lib/cron/lock";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isoIn(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Daily cause-list ALERT. The scraper's nightly sweep populates court.cause_list; here we ask the
// internal API "which of this tenant's tracked CNRs are listed tomorrow?" and raise an in-app alert
// + a case-feed activity for each match. CNR-keyed, so no court mapping is needed on this side.
// (Email/WhatsApp digest delivery is a follow-up — WhatsApp is gated on the BSP work order.)
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return withCronLock("causelist", async () => {
    const supabase = createAdminClient();
    const court = getCourtDataClient();
    // Only the internal API supports the CNR-keyed cause-list lookup; other providers → no-op.
    if (typeof court.getCauseListByCNRs !== "function") {
      return NextResponse.json({ ok: true, source: court.source, skipped: "provider has no by-CNR cause list" });
    }

    const date = isoIn(1); // tomorrow — the sweep publishes the next court day's list overnight

    // Active tracked matters with a CNR, grouped by tenant.
    const { data: matters, error } = await supabase
      .from("matter")
      .select("id, cnr, tenant_id, title")
      .is("deleted_at", null) // service-role bypasses RLS — skip trashed matters (WO-43-W2 soft-delete)
      .not("cnr", "is", null)
      .eq("status", "active");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const byTenant = new Map<string, { id: string; cnr: string; title: string }[]>();
    for (const m of matters ?? []) {
      if (!m.cnr) continue;
      (byTenant.get(m.tenant_id) ?? byTenant.set(m.tenant_id, []).get(m.tenant_id)!).push({ id: m.id, cnr: m.cnr, title: m.title ?? m.cnr });
    }

    let listed = 0;
    let alerted = 0;
    for (const [tenantId, ms] of byTenant) {
      const byCnr = new Map(ms.map((m) => [m.cnr.toUpperCase(), m]));
      let hits;
      try {
        hits = await court.getCauseListByCNRs!(ms.map((m) => m.cnr), date);
      } catch {
        continue; // one tenant's fetch failure never stops the job
      }
      if (!hits.length) continue;

      // Dedupe: skip matters already alerted for this date (idempotent re-runs).
      const { data: prior } = await supabase
        .from("notification")
        .select("payload")
        .eq("tenant_id", tenantId)
        .eq("kind", "cause_list_alert")
        .eq("payload->>eventDate", date);
      const alreadyAlerted = new Set((prior ?? []).map((p) => (p.payload as { ref?: string })?.ref).filter(Boolean));

      const matched: { title: string; cnr: string; itemNo?: string; type?: string; judge?: string }[] = [];
      for (const h of hits) {
        const m = byCnr.get(h.cnr.toUpperCase());
        if (!m) continue;
        listed++;
        matched.push({ title: m.title, cnr: m.cnr, itemNo: h.itemNo, type: h.type, judge: h.judge });
        const ref = `causelist:${m.id}:${date}`;
        if (alreadyAlerted.has(ref)) continue;
        alreadyAlerted.add(ref);
        const body = `Listed ${date}${h.itemNo ? ` · item ${h.itemNo}` : ""}${h.type ? ` (${h.type})` : ""}${h.judge ? ` · ${h.judge}` : ""}`;
        // In-app alert (the bell — delivered by the notify cron, which flips inapp pending→sent).
        await supabase.from("notification").insert({
          tenant_id: tenantId, channel: "inapp", kind: "cause_list_alert", status: "pending",
          scheduled_for: new Date().toISOString(),
          payload: { ref, title: m.title, body, eventDate: date } as Database["public"]["Tables"]["notification"]["Insert"]["payload"],
        });
        // Case-feed activity so it shows on the matter timeline too.
        await supabase.from("activity_event").insert({
          tenant_id: tenantId, matter_id: m.id, type: "case.listed", summary: body,
          meta: { date, itemNo: h.itemNo ?? null, type: h.type ?? null } as Database["public"]["Tables"]["activity_event"]["Insert"]["meta"],
        });
        alerted++;
      }

      // Product analytics (WO-15): a cause-list actually matched this tenant's cases — the core
      // "the product delivered value today" signal. Size BUCKET only (never which cases). Per tenant.
      if (matched.length) track("cause_list_alert", tenantId, { bucket: sizeBucket(matched.length) });
    }

    return NextResponse.json({ ok: true, source: court.source, date, listed, alerted });
  });
}
