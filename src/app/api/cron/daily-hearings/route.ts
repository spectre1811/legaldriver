import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMailer } from "@/lib/notify/mailer";
import { logOutboundEmail } from "@/lib/notify/log";
import { resolveRecipientEmail } from "@/lib/notify/recipients";
import { renderDailyHearings } from "@/lib/email/templates";
import { appUrl, istDate, istFriendlyDate } from "@/lib/notify/email-render";
import { maskTitle } from "@/lib/court/mask";
import type { Database } from "@/lib/db/database.types";
import { withCronLock } from "@/lib/cron/lock";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// WO-264 · the 6 pm IST daily-hearings board (EMAIL_META: "Tomorrow: {count} hearings").
// Vercel cron at 12:30 UTC = 18:00 IST. Source = the synced court record's next-hearing
// dates (matter.next_hearing_date = tomorrow, IST) — NOT the published cause list, which
// generally isn't out by 6 pm; the 7 am in-app cause-list alert stays the list-confirmed
// signal. SEND RULE: a tenant with nothing listed tomorrow gets NO email (renderDailyHearings
// returns null on an empty board — never sent empty). Idempotent per (tenant, date) via a
// `daily_hearings` notification row inserted as `sent` (also gives the bell a record).
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return withCronLock("daily-hearings", async () => {
    const supabase = createAdminClient();
    const mailer = getMailer();
    const date = istDate(1); // tomorrow, IST calendar day

    // WO-314: + stage (matter-level) — cnr was already SELECTed here but never carried past
    // this query into the rendered rows.
    const { data: matters, error } = await supabase
      .from("matter")
      .select("id, tenant_id, title, court, cnr, stage")
      .is("deleted_at", null) // service-role bypasses RLS — skip trashed matters
      .eq("next_hearing_date", date);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // WO-314: purpose + court number ("item number where held") live on the per-matter hearing
    // row for tomorrow's date, not on `matter` — one batched lookup for every matched matter.
    const matterIds = (matters ?? []).map((m) => m.id);
    const hearingByMatter = new Map<string, { purpose: string | null; court_no: string | null }>();
    if (matterIds.length) {
      const { data: hearingRows } = await supabase
        .from("hearing")
        .select("matter_id, purpose, court_no")
        .eq("date", date)
        .in("matter_id", matterIds);
      for (const h of hearingRows ?? []) hearingByMatter.set(h.matter_id, { purpose: h.purpose, court_no: h.court_no });
    }

    const byTenant = new Map<string, { id: string; title: string | null; court: string | null; cnr: string | null; stage: string | null }[]>();
    for (const m of matters ?? []) {
      (byTenant.get(m.tenant_id) ?? byTenant.set(m.tenant_id, []).get(m.tenant_id)!).push({
        id: m.id, title: m.title, court: m.court, cnr: m.cnr, stage: m.stage,
      });
    }

    let sent = 0;
    let skippedEmpty = 0;
    let already = 0;
    let failed = 0;
    for (const [tenantId, list] of byTenant) {
      // Idempotency: one board per tenant per date, even across re-runs.
      const { data: prior } = await supabase
        .from("notification")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("kind", "daily_hearings")
        .eq("payload->>eventDate", date)
        .limit(1)
        .maybeSingle();
      if (prior) { already++; continue; }

      // Rows bind {court} + {parties} (the case title IS the parties caption); {time} is
      // absent — the record carries item numbers, not clock times — so listingNoTime renders.
      // WO-314: + {cnr}/{stage} (matter-level) and {courtNo}/{purpose} (the matching hearing row)
      // as independent sub-lines — masked titles never ride into the parties caption raw (BP-24).
      const rows = list.map((m) => {
        const h = hearingByMatter.get(m.id);
        return {
          ...(m.court ? { court: m.court } : {}),
          ...(m.title ? { parties: maskTitle(m.title) } : {}),
          ...(m.cnr ? { cnr: m.cnr } : {}),
          ...(m.stage ? { stage: m.stage } : {}),
          ...(h?.court_no ? { courtNo: h.court_no } : {}),
          ...(h?.purpose ? { purpose: h.purpose } : {}),
        };
      });
      const rendered = renderDailyHearings(rows, { date: istFriendlyDate(date), count: list.length }, appUrl("/dashboard/calendar"));
      if (!rendered) { skippedEmpty++; continue; } // no honest row survived → no email

      const email = await resolveRecipientEmail(supabase, tenantId);
      if (!email) { failed++; continue; }

      const res = await mailer.send(email, rendered.subject, rendered.html, rendered.text);
      await logOutboundEmail(supabase, { tenantId, to: email, subject: rendered.subject, kind: "reminder", ok: res.ok, providerId: res.id, error: res.error });
      if (!res.ok) { failed++; continue; }

      await supabase.from("notification").insert({
        tenant_id: tenantId, channel: "email", kind: "daily_hearings", status: "sent",
        scheduled_for: new Date().toISOString(), sent_at: new Date().toISOString(),
        payload: { ref: `dailyhearings:${tenantId}:${date}`, eventDate: date, count: list.length, title: `Tomorrow: ${list.length} hearings` } as Database["public"]["Tables"]["notification"]["Insert"]["payload"],
      });
      sent++;
    }

    return NextResponse.json({ ok: true, date, tenants: byTenant.size, sent, skippedEmpty, already, failed });
  });
}
