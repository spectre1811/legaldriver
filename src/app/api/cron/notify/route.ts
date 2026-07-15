import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMailer } from "@/lib/notify/mailer";
import { getMessagingClient, messagingConfigured } from "@/lib/services/messaging/client";
import { normalizeE164 } from "@/lib/phone";
import { logOutboundEmail } from "@/lib/notify/log";
import { brand } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Notification send-worker. Vercel Cron hits this frequently. Picks up due,
// pending notifications and delivers them: email via Resend, in-app marked sent
// for display. Idempotent — each row flips pending -> sent exactly once.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const mailer = getMailer();
  const nowIso = new Date().toISOString();

  const { data: due, error } = await supabase
    .from("notification")
    .select("id, tenant_id, user_id, channel, kind, payload")
    .eq("status", "pending")
    .lte("scheduled_for", nowIso)
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const n of due ?? []) {
    const payload = (n.payload ?? {}) as { ref?: string; title?: string; eventDate?: string; body?: string; count?: number; cases?: DigestCase[]; phone?: string };
    let ok = true;

    // WhatsApp (WO-144 W1): delivered through the real messaging gateway. Skip — NOT fail — while
    // unconfigured (no BSP) or on an unparseable number, so the row stays pending and delivers the
    // moment a provider is live; no churn to a permanent 'failed'.
    if (n.channel === "whatsapp") {
      const to = normalizeE164(payload.phone);
      if (!messagingConfigured() || !to) { skipped++; continue; }
      const client = getMessagingClient();
      const res = await client.send({ to, channel: "whatsapp", body: payload.body ?? subjectFor(n.kind, payload), tenantId: n.tenant_id });
      ok = res.status !== "failed";
      const { error: waErr } = await supabase
        .from("notification")
        .update({ status: ok ? "sent" : "failed", sent_at: ok ? new Date().toISOString() : null })
        .eq("id", n.id)
        .eq("status", "pending");
      if (waErr || !ok) failed++;
      else sent++;
      continue;
    }

    if (n.channel === "email") {
      // Resolve recipient: the row's user, else the tenant owner.
      let email: string | undefined;
      if (n.user_id) {
        const { data: u } = await supabase.auth.admin.getUserById(n.user_id);
        email = u.user?.email ?? undefined;
      }
      if (!email) {
        const { data: owner } = await supabase
          .from("profile")
          .select("id")
          .eq("tenant_id", n.tenant_id)
          .eq("role", "owner")
          .limit(1)
          .maybeSingle();
        if (owner?.id) {
          const { data: u } = await supabase.auth.admin.getUserById(owner.id);
          email = u.user?.email ?? undefined;
        }
      }
      if (email) {
        const subject = subjectFor(n.kind, payload);
        const res = await mailer.send(email, subject, htmlFor(n.kind, payload));
        ok = res.ok;
        await logOutboundEmail(supabase, { tenantId: n.tenant_id, to: email, subject, kind: n.kind.includes("reminder") ? "reminder" : "notice", ok: res.ok, providerId: res.id });
      } else {
        ok = false;
      }
    }
    // in-app: nothing to deliver; flipping to sent makes it visible in the bell.

    const { error: upErr } = await supabase
      .from("notification")
      .update({ status: ok ? "sent" : "failed", sent_at: ok ? new Date().toISOString() : null })
      .eq("id", n.id)
      .eq("status", "pending"); // idempotency guard
    if (upErr || !ok) failed++;
    else sent++;
  }

  return NextResponse.json({ ok: true, channel: mailer.channel, whatsapp: messagingConfigured() ? "live" : "dark", considered: due?.length ?? 0, sent, failed, skipped });
}

type DigestCase = { title?: string; cnr?: string; itemNo?: string; type?: string; judge?: string };

function subjectFor(kind: string, p: { title?: string; eventDate?: string; count?: number }) {
  if (kind === "hearing_reminder") return `Hearing reminder: ${p.title ?? "case"} on ${p.eventDate ?? ""}`;
  if (kind === "deadline_reminder") return `Deadline: ${p.title ?? ""} due ${p.eventDate ?? ""}`;
  if (kind === "notice_escalation") return `Notice escalated: ${p.title ?? ""}`;
  if (kind === "case_update") return `Case update: ${p.title ?? "your case"}`;
  if (kind === "cause_list_digest") {
    const n = p.count ?? 0;
    return `Cause list: ${n} case${n === 1 ? "" : "s"} listed ${p.eventDate ?? "tomorrow"}`;
  }
  return `${brand.name} notification`;
}
function htmlFor(kind: string, p: { title?: string; eventDate?: string; body?: string; count?: number; cases?: DigestCase[] }) {
  const esc = (s?: string) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let inner = `<p>${esc(p.body) || `Open ${brand.name} to view details.`}</p>`;
  if (kind === "cause_list_digest" && p.cases?.length) {
    const rows = p.cases.map((c) => `<li style="margin:6px 0">
        <strong>${esc(c.title) || esc(c.cnr) || "Case"}</strong>${c.cnr ? ` <span style="color:#64748b">(${esc(c.cnr)})</span>` : ""}
        <br><span style="color:#475569;font-size:13px">${c.itemNo ? `Item ${esc(c.itemNo)}` : ""}${c.type ? ` · ${esc(c.type)}` : ""}${c.judge ? ` · ${esc(c.judge)}` : ""}</span>
      </li>`).join("");
    inner = `<p>These tracked cases are listed on <strong>${esc(p.eventDate) || "the next court day"}</strong>:</p>
      <ul style="padding-left:18px;list-style:disc">${rows}</ul>`;
  }
  return `<div style="font-family:system-ui,sans-serif">
    <h2 style="color:#0f172a">${subjectFor(kind, p)}</h2>
    ${inner}
    <p style="color:#94a3b8;font-size:12px">Not legal advice. Verify against the official record.</p>
  </div>`;
}
