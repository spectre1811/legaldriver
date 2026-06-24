import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMailer } from "@/lib/notify/mailer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Notification send-worker. Vercel Cron hits this frequently. Picks up due,
// pending notifications and delivers them: email via Resend, in-app marked sent
// for display. Idempotent — each row flips pending -> sent exactly once.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
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
  for (const n of due ?? []) {
    const payload = (n.payload ?? {}) as { ref?: string; title?: string; eventDate?: string; body?: string };
    let ok = true;

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

  return NextResponse.json({ ok: true, channel: mailer.channel, considered: due?.length ?? 0, sent, failed });
}

function subjectFor(kind: string, p: { title?: string; eventDate?: string }) {
  if (kind === "hearing_reminder") return `Hearing reminder: ${p.title ?? "case"} on ${p.eventDate ?? ""}`;
  if (kind === "deadline_reminder") return `Deadline: ${p.title ?? ""} due ${p.eventDate ?? ""}`;
  if (kind === "notice_escalation") return `Notice escalated: ${p.title ?? ""}`;
  return `Legaldriver notification`;
}
function htmlFor(kind: string, p: { title?: string; eventDate?: string; body?: string }) {
  return `<div style="font-family:system-ui,sans-serif">
    <h2 style="color:#0f172a">${subjectFor(kind, p)}</h2>
    <p>${p.body ?? "Open Legaldriver to view details."}</p>
    <p style="color:#94a3b8;font-size:12px">Not legal advice. Verify against the official record.</p>
  </div>`;
}
