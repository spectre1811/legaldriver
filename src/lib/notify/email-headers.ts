// WO-416 · per-kind email deliverability headers, framework-free and DB-free so the offline suite
// can prove the send rules without a live service. Three concerns, all pure:
//   1. Kind classification (transactional vs not) — EXHAUSTIVE over the closed kind union, never a
//      default branch (amendment #4): adding a kind to EMAIL_KINDS without classifying it in
//      TRANSACTIONAL_KINDS fails typecheck.
//   2. Header building — threading (Message-ID/References) for matter-linked mail, and
//      List-Unsubscribe (+Post) for non-transactional mail. OTP/security/invoice/receipt/welcome
//      are transactional: they carry NO unsubscribe header and are NEVER suppressed.
//   3. Suppression decision — a recipient whose channel_email is false is skipped, but only for
//      non-transactional kinds (a user must not be able to lock themselves out of sign-in).

import { appUrl } from "@/lib/notify/email-render";
import { signUnsubscribeToken } from "@/lib/notify/unsubscribe-token";

// The notification kinds the product emits (canonical vocabulary: i18n notifications.kind) plus the
// transactional email kinds named in the WO. Closed set on purpose — see the exhaustiveness note.
export const EMAIL_KINDS = [
  "hearing_reminder",
  "deadline_reminder",
  "notice_escalation",
  "ipr_renewal",
  "case_update",
  "daily_hearings",
  "cause_list_alert",
  "trackConfirm",
  "security",
  "otp",
  "invoice",
  "receipt",
  "welcome",
] as const;

export type EmailKind = (typeof EMAIL_KINDS)[number];

// Exhaustive by construction: `Record<EmailKind, boolean>` demands exactly one entry per union
// member (missing ⇒ type error) and rejects extras — so a future kind can never silently default
// into the wrong bucket; it fails typecheck until a human classifies it here.
const TRANSACTIONAL_KINDS: Record<EmailKind, boolean> = {
  hearing_reminder: false,
  deadline_reminder: false,
  notice_escalation: false,
  ipr_renewal: false,
  case_update: false,
  daily_hearings: false,
  cause_list_alert: false,
  trackConfirm: false,
  security: true,
  otp: true,
  invoice: true,
  receipt: true,
  welcome: true,
};

export function isTransactionalKind(kind: EmailKind): boolean {
  return TRANSACTIONAL_KINDS[kind];
}

// Runtime boundary: the notification table hands us a bare string. An UNKNOWN kind is treated as
// non-transactional (carry the headers, allow suppression) — the deliverability-safe side, since
// omitting List-Unsubscribe on a bulk kind is exactly what Gmail penalises. Never a "transactional"
// default, which would silently strip the header from a future bulk kind.
export function asEmailKind(kind: string): EmailKind | null {
  return (EMAIL_KINDS as readonly string[]).includes(kind) ? (kind as EmailKind) : null;
}

// True when this (string) kind must be suppressed for a recipient with channel_email = false.
export function shouldSuppressEmail(kind: string, channelEmail: boolean): boolean {
  if (channelEmail !== false) return false; // enabled (or no prefs row ⇒ default true) ⇒ never skip
  const ek = asEmailKind(kind);
  return ek ? !isTransactionalKind(ek) : true; // unknown ⇒ non-transactional (fail-safe: suppress)
}

export type EmailHeaderContext = {
  kind: string; // notification kind; unknown ⇒ non-transactional
  matterId?: string | null; // resolved matter id — threading only when present
  tenantId: string;
  profileId?: string | null; // recipient profile id (notification_prefs.id) — token scope
  from: string; // sender email; its domain anchors the Message-ID
  messageId?: string; // per-send unique id (the notification row id)
};

// Build the headers to attach to one send. Pure and total: never throws. A signing-secret outage
// omits the List-Unsubscribe header (the pre-existing "no header" status quo) rather than emitting a
// broken unsubscribe link — amendment #1's "a header pointing at a no-op is worse than none".
export function buildEmailHeaders(ctx: EmailHeaderContext): Record<string, string> {
  const headers: Record<string, string> = {};
  const domain = ctx.from.split("@")[1];
  if (!domain) return headers;

  // Threading: matter-linked only. Stable per-matter root Message-ID + References to it; Gmail then
  // threads a case's reminders/orders/updates into one conversation. Non-matter mail stays unthreaded.
  const matterId = ctx.matterId ? ctx.matterId.toLowerCase() : undefined;
  if (matterId) {
    headers["Message-ID"] = `<n.${(ctx.messageId ?? "0").toLowerCase()}@${domain}>`;
    headers["References"] = `<matter.${matterId}@${domain}>`;
  }

  // List-Unsubscribe (+Post): non-transactional only, and only when we can scope the token to the
  // recipient's profile. mailto (best-effort fallback) + https (the RFC 8058 one-click POST target).
  const ek = asEmailKind(ctx.kind);
  const transactional = ek ? isTransactionalKind(ek) : false; // unknown ⇒ non-transactional
  if (!transactional && ctx.profileId) {
    try {
      const token = signUnsubscribeToken(ctx.tenantId, ctx.profileId, "email");
      const url = appUrl(`/unsubscribe/${token}`);
      // https one-click only (RFC 8058 requires the https URI + Post; mailto is optional). A mailto
      // may be added IF a monitored inbox ever exists — pointing it at an unread address would
      // silently swallow the request, the same defect this WO removes.
      headers["List-Unsubscribe"] = `<${url}>`;
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    } catch {
      // signing secret unconfigured — omit rather than emit a broken link (see header comment)
    }
  }

  return headers;
}
