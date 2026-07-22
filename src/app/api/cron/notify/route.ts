import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMailer } from "@/lib/notify/mailer";
import { getMessagingClient, messagingConfigured } from "@/lib/services/messaging/client";
import { canSendWhatsApp } from "@/lib/services/messaging/consent";
import { normalizeE164 } from "@/lib/phone";
import { logOutboundEmail } from "@/lib/notify/log";
import { resolveRecipientEmail } from "@/lib/notify/recipients";
import { renderEmail, renderNotice, type RenderedEmail } from "@/lib/email/templates";
import { appUrl, composeCaseUpdate, hearingWhenLabel, matterIdOf, type CaseUpdatePayload } from "@/lib/notify/email-render";
import { caseDetailHref } from "@/lib/court/case-links";
import { brand } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Notification send-worker. Vercel Cron hits this daily. Picks up due, pending
// notifications and delivers them: email via the WO-148 v2 template system
// (WO-264 — the pre-v2 ad-hoc htmlFor() is gone), in-app marked sent for display.
// Idempotent — each row flips pending -> sent exactly once.
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

  // WO-264 defect fix (2026-07-22, founder-hit live): notification rows can OUTLIVE
  // their matter — something hard-deletes matters without an audit trail (INBOX:
  // data-lifecycle investigation), and a reminder sent afterwards deep-links to a 404.
  // Verify every matter-linked email row against the live table in ONE batch; dead
  // refs flip failed and never send. 290/1846 pending rows were dead on discovery day.
  const refIds = [
    ...new Set(
      (due ?? [])
        .filter((n) => n.channel === "email")
        .map((n) => matterIdOf((n.payload ?? {}) as Payload))
        .filter((id): id is string => !!id),
    ),
  ];
  const liveMatters = new Set<string>();
  if (refIds.length) {
    const { data: live } = await supabase.from("matter").select("id").in("id", refIds).is("deleted_at", null);
    for (const m of live ?? []) liveMatters.add(m.id);
  }
  const isDeadRef = (p: Payload) => {
    const id = matterIdOf(p);
    return !!id && !liveMatters.has(id);
  };

  // WO-264 · caseUpdate roundup ("tight per-user roundup, avoid spam"): all of a
  // tenant's due caseUpdate email rows in this run fold into ONE email. The first
  // row the loop reaches is the subject-bearer; siblings are folded + flipped with it.
  // Dead-ref rows never join a group — a vanished matter must not ride into a roundup.
  const caseUpdateGroup = new Map<string, { id: string; payload: Payload }[]>();
  for (const n of due ?? []) {
    if (n.channel === "email" && n.kind === "case_update" && !isDeadRef((n.payload ?? {}) as Payload)) {
      const list = caseUpdateGroup.get(n.tenant_id) ?? caseUpdateGroup.set(n.tenant_id, []).get(n.tenant_id)!;
      list.push({ id: n.id, payload: (n.payload ?? {}) as Payload });
    }
  }
  const handled = new Set<string>();

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let stale = 0;
  let deadRefs = 0;
  let roundups = 0;
  for (const n of due ?? []) {
    if (handled.has(n.id)) continue; // delivered as part of a caseUpdate roundup
    const payload = (n.payload ?? {}) as Payload;
    let ok = true;

    // WhatsApp (WO-144 W1): delivered through the real messaging gateway. Skip — NOT fail — while
    // unconfigured (no BSP) or on an unparseable number, so the row stays pending and delivers the
    // moment a provider is live; no churn to a permanent 'failed'.
    if (n.channel === "whatsapp") {
      const to = normalizeE164(payload.phone);
      if (!messagingConfigured() || !to) { skipped++; continue; }
      // WO-144 W2: no open consent ⇒ skip, row stays pending — delivers only once consent exists (skip-not-fail per W1).
      if (!(await canSendWhatsApp(supabase, to))) { skipped++; continue; }
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
      // Dead matter ref: the case this row points at no longer exists — sending would
      // deep-link to a 404. Flip failed (undeliverable), count it.
      if (isDeadRef(payload)) {
        await supabase
          .from("notification")
          .update({ status: "failed", sent_at: null })
          .eq("id", n.id)
          .eq("status", "pending");
        deadRefs++;
        continue;
      }

      // Stale hearing reminder: the hearing date already passed at send time — a late
      // reminder presented as current would be dishonest. Flip failed (undelivered), count it.
      if (n.kind === "hearing_reminder" && hearingWhenLabel(payload.eventDate ?? "") === null) {
        await supabase
          .from("notification")
          .update({ status: "failed", sent_at: null })
          .eq("id", n.id)
          .eq("status", "pending");
        stale++;
        continue;
      }

      const email = await resolveRecipientEmail(supabase, n.tenant_id, n.user_id);
      if (email) {
        const group = n.kind === "case_update" ? caseUpdateGroup.get(n.tenant_id) : undefined;
        const rendered = renderForKind(n.kind, payload, group?.map((g) => g.payload));
        // Siblings may only be flipped when the roundup actually composed — a null compose
        // falls back to a single-row notice that does NOT carry the siblings' content
        // (review finding, PR#192; unreachable today, cheap to make impossible).
        const roundupComposed =
          !!group && group.length > 1 && composeCaseUpdate(group.map((g) => g.payload)) !== null;
        if (rendered) {
          const res = await mailer.send(email, rendered.subject, rendered.html, rendered.text);
          ok = res.ok;
          await logOutboundEmail(supabase, { tenantId: n.tenant_id, to: email, subject: rendered.subject, kind: n.kind.includes("reminder") ? "reminder" : "notice", ok: res.ok, providerId: res.id });
          // Roundup: the siblings were delivered inside this email — flip them with the primary.
          if (ok && roundupComposed && group) {
            const siblingIds = group.map((g) => g.id).filter((id) => id !== n.id);
            siblingIds.forEach((id) => handled.add(id));
            const { error: sibErr } = await supabase
              .from("notification")
              .update({ status: "sent", sent_at: new Date().toISOString() })
              .in("id", siblingIds)
              .eq("status", "pending");
            if (!sibErr) sent += siblingIds.length;
            roundups++;
          }
        } else {
          ok = false; // subject slot couldn't fill — no honest email to send
        }
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

  return NextResponse.json({ ok: true, channel: mailer.channel, whatsapp: messagingConfigured() ? "live" : "dark", considered: due?.length ?? 0, sent, failed, skipped, stale, deadRefs, roundups });
}

type DigestCase = { title?: string; cnr?: string; itemNo?: string; type?: string; judge?: string };
type Payload = CaseUpdatePayload & {
  body?: string;
  count?: number;
  cases?: DigestCase[];
  phone?: string;
  purpose?: string;
};

// Render one notification kind to a v2 email (WO-264). Dedicated templates for
// case_update + hearing_reminder; every other kind goes through the renderNotice
// fallback shell — one design system, real payload data only.
function renderForKind(kind: string, p: Payload, group?: CaseUpdatePayload[]): RenderedEmail | null {
  const matterId = p.matterId ?? (p.ref?.startsWith("matter:") ? p.ref.slice("matter:".length) : undefined);

  if (kind === "case_update") {
    const composed = composeCaseUpdate(group && group.length ? group : [p]);
    if (composed) return renderEmail("caseUpdate", composed.data, appUrl(composed.ctaPath));
    // legacy row without a change label → honest generic notice below
  }

  if (kind === "hearing_reminder") {
    const when = hearingWhenLabel(p.eventDate ?? ""); // caller already skipped null (stale)
    if (when) {
      const rendered = renderEmail(
        "hearingReminder",
        { when, case: p.title, court: p.court, cnr: p.cnr, purpose: p.purpose },
        appUrl(p.cnr || matterId ? caseDetailHref(p.cnr ?? "", matterId) : "/dashboard/calendar"),
      );
      if (rendered) return rendered;
    }
  }

  // Fallback: generic branded notice from the real payload (deadline_reminder,
  // notice_escalation, legacy in-flight cause_list_digest rows, legacy case_update).
  const lines: { text: string; role?: "lead" | "muted" }[] = [];
  if (kind === "cause_list_digest" && p.cases?.length) {
    lines.push({ text: `These tracked cases are listed on ${p.eventDate ?? "the next court day"}:`, role: "lead" });
    for (const c of p.cases) {
      const detail = [c.itemNo ? `Item ${c.itemNo}` : null, c.type, c.judge].filter(Boolean).join(" · ");
      lines.push({ text: `${c.title ?? c.cnr ?? "Case"}${c.cnr ? ` (${c.cnr})` : ""}${detail ? ` — ${detail}` : ""}` });
    }
  } else if (p.body) {
    lines.push({ text: p.body, role: "lead" });
  } else {
    lines.push({ text: `Open ${brand.name} to view details.`, role: "lead" });
  }
  const ctaPath = kind === "cause_list_digest" ? "/dashboard/calendar" : matterId || p.cnr ? caseDetailHref(p.cnr ?? "", matterId) : "/dashboard";
  return renderNotice(subjectFor(kind, p), lines, appUrl(ctaPath), "Open " + brand.name);
}

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
