// WO-358 W1 — email delivery module extracted from cron/notify/route.ts.
// Per-channel try/catch isolation: an email throw never blocks WhatsApp or in-app.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { senderEmail, type Mailer } from "@/lib/notify/mailer";
import { resolveRecipientEmail } from "@/lib/notify/recipients";
import { logOutboundEmail } from "@/lib/notify/log";
import { retryPlan } from "@/lib/notify/retry";
import { hearingWhenLabel, matterIdOf } from "@/lib/notify/email-render";
import type { CaseUpdatePayload } from "@/lib/notify/email-render";
import { buildEmailHeaders, shouldSuppressEmail } from "@/lib/notify/email-headers";
import type { NotifyRow } from "@/lib/notify/pickup";
import type { DeadRefFilter } from "@/lib/notify/filter/dead-refs";
import { composeCaseUpdateEmail, roundupComposed } from "@/lib/notify/compose/case-update";
import { composeHearingReminderEmail } from "@/lib/notify/compose/hearing-reminder";
import { composeFallbackNotice } from "@/lib/notify/compose/fallback";
import type { RenderedEmail } from "@/lib/email/templates";

type AdminDB = SupabaseClient<Database>;
type FullPayload = CaseUpdatePayload & {
  body?: string; count?: number;
  // WO-314: hearingReminder-only field — the hearing row's court number, not part of
  // CaseUpdatePayload since the caseUpdate template doesn't carry a per-hearing court no.
  courtNo?: string;
  phone?: string; purpose?: string; eventDate?: string;
  cases?: { title?: string; cnr?: string; itemNo?: string; type?: string; judge?: string }[];
};

export type EmailDeliverResult = {
  sent: boolean;
  failed: boolean;
  deadRefs: boolean;
  stale: boolean;
  siblings: number;
  attempt: boolean;
  attemptFailed: boolean;
  dead: boolean;
  suppressed: boolean;
  lastSendError?: string;
};

// Render one notification kind to a v2 email (WO-264). Dedicated templates for
// case_update + hearing_reminder; every other kind goes through the renderNotice
// fallback shell — one design system, real payload data only.
function renderForKind(kind: string, p: FullPayload, group?: CaseUpdatePayload[]): RenderedEmail | null {
  if (kind === "case_update") {
    const composed = composeCaseUpdateEmail(p, group);
    if (composed) return composed;
    // legacy row without a change label → honest generic notice below
  }

  if (kind === "hearing_reminder") {
    const rendered = composeHearingReminderEmail(p);
    if (rendered) return rendered;
  }

  return composeFallbackNotice(kind, p);
}

// Run the retry-plan DB flip for a non-delivered email row — every picked-up row
// must leave the run in a non-pending state (failed|dead) so it advances toward
// MAX_SEND_ATTEMPTS and eventually dies, rather than being re-picked forever
// and starving the pickup window.
async function flipFailed(
  supabase: AdminDB,
  row: NotifyRow,
): Promise<{ dead: boolean }> {
  const plan = retryPlan(row.attempts);
  const isDead = plan.status === "dead";
  let upErr: { message: string } | null = null;
  ({ error: upErr } = await supabase
    .from("notification")
    .update({
      status: plan.status,
      attempts: plan.attempts,
      sent_at: null,
      ...(plan.scheduled_for ? { scheduled_for: plan.scheduled_for } : {}),
    })
    .eq("id", row.id)
    .in("status", ["pending", "failed"]));
  // Pre-migration fail-soft: no `attempts` column / no 'dead' status ⇒ today's plain flip.
  if (upErr)
    ({ error: upErr } = await supabase
      .from("notification")
      .update({ status: "failed", sent_at: null })
      .eq("id", row.id)
      .eq("status", "pending"));
  return { dead: isDead };
}

export async function deliverEmail(
  supabase: AdminDB,
  mailer: Mailer,
  row: NotifyRow,
  deps: {
    isDeadRef: DeadRefFilter["isDeadRef"];
    flipTerminal: DeadRefFilter["flipTerminal"];
    caseUpdateGroup?: Map<string, { id: string; payload: CaseUpdatePayload }[]>;
    handled: Set<string>;
    now: Date;
  },
): Promise<EmailDeliverResult> {
  try {
    return await deliverEmailInner(supabase, mailer, row, deps);
  } catch (e) {
    // WO-358 W1: per-channel isolation — an unexpected throw in email delivery
    // (network, template render, DB flake) is caught and counted as a failed
    // row. WhatsApp and in-app rows in the same run are NOT affected.
    console.error(`[notify] email delivery threw for row ${row.id}: ${e instanceof Error ? e.message : String(e)}`);
    const { dead } = await flipFailed(supabase, row);
    return {
      sent: false, failed: true, deadRefs: false, stale: false,
      siblings: 0, attempt: true, attemptFailed: true, dead, suppressed: false,
      lastSendError: e instanceof Error ? e.message : "unexpected throw",
    };
  }
}

async function deliverEmailInner(
  supabase: AdminDB,
  mailer: Mailer,
  row: NotifyRow,
  deps: {
    isDeadRef: DeadRefFilter["isDeadRef"];
    flipTerminal: DeadRefFilter["flipTerminal"];
    caseUpdateGroup?: Map<string, { id: string; payload: CaseUpdatePayload }[]>;
    handled: Set<string>;
    now: Date;
  },
): Promise<EmailDeliverResult> {
  const payload = row.payload as unknown as FullPayload;
  const now = deps.now;

  // Dead matter ref: the case this row points at no longer exists — sending would
  // deep-link to a 404. Terminal 'dead' (undeliverable by definition, never retried).
  if (deps.isDeadRef(payload)) {
    await deps.flipTerminal(row.id);
    return { sent: false, failed: false, deadRefs: true, stale: false, siblings: 0, attempt: false, attemptFailed: false, dead: false, suppressed: false };
  }

  // Stale hearing reminder: the hearing date already passed at send time — a late
  // reminder presented as current would be dishonest. Terminal 'dead', count it.
  if (row.kind === "hearing_reminder" && hearingWhenLabel(payload.eventDate ?? "") === null) {
    await deps.flipTerminal(row.id);
    return { sent: false, failed: false, deadRefs: false, stale: true, siblings: 0, attempt: false, attemptFailed: false, dead: false, suppressed: false };
  }

  const rec = await resolveRecipientEmail(supabase, row.tenant_id, row.user_id);
  if (!rec) {
    const { dead } = await flipFailed(supabase, row);
    return { sent: false, failed: true, deadRefs: false, stale: false, siblings: 0, attempt: false, attemptFailed: false, dead, suppressed: false };
  }

  // WO-416 amendment #1: a recipient who turned email off must be SKIPPED, not sent to — otherwise
  // the List-Unsubscribe header points at a no-op and the user's next move is the spam button.
  // Transactional kinds (OTP/security/invoice/receipt/welcome) are NEVER suppressed: a user must
  // not be able to lock themselves out of sign-in. `shouldSuppressEmail` is the pure gate.
  {
    const { data: prefs, error: prefsErr } = await supabase
      .from("notification_prefs")
      .select("channel_email")
      .eq("id", rec.profileId)
      .maybeSingle();
    // Fail OPEN (send) on a read error — but loud, not silent (WO-126 / convention #4).
    if (prefsErr) console.warn(`[notify] notification_prefs read failed (${prefsErr.message}) — treating email as on`);
    const channelEmail = prefs ? prefs.channel_email : true; // no prefs row ⇒ default on
    if (shouldSuppressEmail(row.kind, channelEmail)) {
      // Terminal (never retried). `notification.status` is check-constrained to
      // ('pending','sent','failed','dead') — no new status, no migration. A suppressed
      // recipient is undeliverable-by-definition, so it reuses the terminal 'dead' flip.
      const { error: deadErr } = await supabase
        .from("notification")
        .update({ status: "dead", sent_at: null })
        .eq("id", row.id)
        .in("status", ["pending", "failed"]);
      if (deadErr)
        await supabase.from("notification").update({ status: "failed", sent_at: null }).eq("id", row.id).eq("status", "pending");
      return { sent: false, failed: false, deadRefs: false, stale: false, siblings: 0, attempt: false, attemptFailed: false, dead: false, suppressed: true };
    }
  }

  const group = row.kind === "case_update" ? deps.caseUpdateGroup?.get(row.tenant_id) : undefined;
  const rendered = renderForKind(row.kind, payload, group?.map((g) => g.payload));

  // Siblings may only be flipped when the roundup actually composed — a null compose
  // falls back to a single-row notice that does NOT carry the siblings' content
  // (review finding, PR#192; unreachable today, cheap to make impossible).
  const composedRoundup = !!group && roundupComposed(group);

  if (!rendered) {
    const { dead } = await flipFailed(supabase, row);
    return { sent: false, failed: true, deadRefs: false, stale: false, siblings: 0, attempt: false, attemptFailed: false, dead, suppressed: false };
  }

  // WO-416: threading + List-Unsubscribe headers, computed per kind (pure, tested offline).
  const headers = buildEmailHeaders({
    kind: row.kind,
    matterId: matterIdOf(payload),
    tenantId: row.tenant_id,
    profileId: rec.profileId,
    from: senderEmail(),
    messageId: row.id,
  });

  const res = await mailer.send(rec.email, rendered.subject, rendered.html, rendered.text, { headers });
  const ok = res.ok;

  await logOutboundEmail(supabase, {
    tenantId: row.tenant_id,
    to: rec.email,
    subject: rendered.subject,
    kind: row.kind.includes("reminder") ? "reminder" : "notice",
    ok: res.ok,
    providerId: res.id,
    error: res.error,
  });

  // Roundup: the siblings were delivered inside this email — flip them with the primary.
  let siblings = 0;
  if (ok && composedRoundup && group) {
    const siblingIds = group.map((g) => g.id).filter((id) => id !== row.id);
    siblingIds.forEach((id) => deps.handled.add(id));
    const { error: sibErr } = await supabase
      .from("notification")
      .update({ status: "sent", sent_at: now.toISOString() })
      .in("id", siblingIds)
      .in("status", ["pending", "failed"]); // a retried sibling folds in too
    if (!sibErr) siblings = siblingIds.length;
  }

  // Idempotency guard on every flip: only a still-queued row ('pending', or
  // 'failed' for the retry lane) can transition — a row already flipped 'sent'
  // can never be re-flipped, and the pickup queries above never select 'sent'/'dead'
  // rows, so one logical notification sends at most once successfully (WO-288 e).
  let upErr: { message: string } | null = null;
  if (ok) {
    ({ error: upErr } = await supabase
      .from("notification")
      .update({ status: "sent", sent_at: now.toISOString() })
      .eq("id", row.id)
      .in("status", ["pending", "failed"]));
    return {
      sent: upErr === null,
      failed: upErr !== null,
      deadRefs: false, stale: false, siblings,
      attempt: true, attemptFailed: false, dead: false, suppressed: false,
    };
  } else {
    const plan = retryPlan(row.attempts);
    const isDead = plan.status === "dead";
    ({ error: upErr } = await supabase
      .from("notification")
      .update({
        status: plan.status,
        attempts: plan.attempts,
        sent_at: null,
        ...(plan.scheduled_for ? { scheduled_for: plan.scheduled_for } : {}),
      })
      .eq("id", row.id)
      .in("status", ["pending", "failed"]));
    // Pre-migration fail-soft: no `attempts` column / no 'dead' status ⇒ today's plain flip.
    if (upErr)
      ({ error: upErr } = await supabase
        .from("notification")
        .update({ status: "failed", sent_at: null })
        .eq("id", row.id)
        .eq("status", "pending"));
    return {
      sent: false, failed: true,
      deadRefs: false, stale: false, siblings,
      attempt: true, attemptFailed: true, dead: isDead, suppressed: false,
      lastSendError: res.error ?? "send failed",
    };
  }
}
