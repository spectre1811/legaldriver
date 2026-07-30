// WO-264 · pure helpers for the email send path. Framework-free so the offline
// suite can prove the send rules (when-labels, stale-skip, roundup honesty,
// IST day math) without a DB or a route handler.

import { caseDetailHref } from "@/lib/court/case-links";

/** Absolute app URL for email CTAs (emails can't use relative hrefs). */
export function appUrl(path = ""): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.mukadma.in";
  return base.replace(/\/$/, "") + path;
}

/** Calendar date (YYYY-MM-DD) in Asia/Kolkata, `offsetDays` from now. All product
 *  "today/tomorrow" logic is IST (NOW.md time posture); storage stays UTC. */
export function istDate(offsetDays = 0, now = new Date()): string {
  const shifted = new Date(now.getTime() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(shifted);
}

/** Human date ("24 Jul") in IST for a YYYY-MM-DD string. */
export function istFriendlyDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00+05:30`);
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }).format(d);
}

/**
 * Closed-set when-label for a hearing reminder, computed at SEND time in IST.
 * "today" | "tomorrow" | "in N days". Returns null when the event date is already
 * past — a stale reminder must be SKIPPED, never sent late as if current.
 * Keeps the subject "Hearing {when}" ≤ 6 words by construction.
 */
export function hearingWhenLabel(eventDate: string, now = new Date()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(eventDate ?? "")) return null;
  const event = eventDate.slice(0, 10);
  const today = istDate(0, now);
  if (event < today) return null; // stale — skip
  if (event === today) return "today";
  if (event === istDate(1, now)) return "tomorrow";
  const days = Math.round((Date.parse(`${event}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return `in ${days} days`;
}

// The notification payload shape the caseUpdate email path binds from
// (written by recordCaseChanges in src/lib/court/sync.ts).
export type CaseUpdatePayload = {
  ref?: string;
  title?: string;
  body?: string;
  eventDate?: string;
  change?: string;
  cnr?: string;
  court?: string;
  matterId?: string;
  // WO-314: widened at the producer (recordCaseChanges) so the email answers "what happened,
  // to which case, what's next" from the body alone — not just change + title.
  stage?: string;
  purpose?: string; // the next hearing's purpose, when the record carries one
  coram?: string; // full bench, pre-joined ("Justice A, Justice B") — never just judges[0]
  regNo?: string; // registration number, from matter.detail.registrationNumber (no case_number column)
  orderTitle?: string;
  orderDate?: string; // the latest order on file, human-formatted (IST)
};

/**
 * The matter id a notification payload points at, when it points at one:
 * explicit `matterId`, else a `matter:<uuid>` ref. Non-uuid refs → undefined
 * (nothing to verify). WO-264 defect fix: rows can OUTLIVE their matter, so
 * every matter-linked email is verified against the live table before sending.
 */
export function matterIdOf(p: { matterId?: unknown; ref?: unknown }): string | undefined {
  // jsonb payloads are untrusted shapes — a non-string ref/matterId must parse to
  // "no ref", never throw (one malformed row must not crash the whole cron run).
  const explicit = typeof p.matterId === "string" ? p.matterId : undefined;
  const fromRef =
    typeof p.ref === "string" && p.ref.startsWith("matter:") ? p.ref.slice("matter:".length) : undefined;
  const id = explicit ?? fromRef;
  return id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : undefined;
}

/**
 * Fold one tenant's due caseUpdate rows into ONE email's data (the founder's
 * "tight per-user roundup, avoid spam" rule). The first change is the
 * subject-bearer; further changed matters ride the honest free-text detail slot
 * as a plain enumeration — real titles, no fabricated aggregates.
 */
export function composeCaseUpdate(rows: CaseUpdatePayload[]): { data: Record<string, string>; ctaPath: string } | null {
  const primary = rows[0];
  if (!primary?.change || !primary.title) return null; // legacy row without a change label → caller falls back
  const others = rows.slice(1).map((r) => r.title).filter((t): t is string => !!t);
  const detail = [primary.body, others.length ? `Also updated today: ${others.join(" · ")}.` : null]
    .filter(Boolean)
    .join(" ");
  const data: Record<string, string> = {
    change: primary.change,
    case: primary.title,
    ...(primary.court ? { court: primary.court } : {}),
    ...(primary.cnr ? { cnr: primary.cnr } : {}),
    ...(detail ? { detail } : {}),
    // WO-314: eventDate was already on the payload and silently dropped here — the founder's
    // "shows nothing about the case" complaint's first cause. It carries the CURRENT next
    // hearing date regardless of which field changed (order/bench/date), so it shows even when
    // the change itself was e.g. a bench swap.
    ...(primary.eventDate ? { nextHearingDate: istFriendlyDate(primary.eventDate) } : {}),
    ...(primary.stage ? { stage: primary.stage } : {}),
    ...(primary.purpose ? { purpose: primary.purpose } : {}),
    ...(primary.coram ? { coram: primary.coram } : {}),
    ...(primary.regNo ? { regNo: primary.regNo } : {}),
    ...(primary.orderTitle && primary.orderDate ? { orderTitle: primary.orderTitle, orderDate: primary.orderDate } : {}),
  };
  // One CTA per email: the primary case when addressable, else the caseload.
  const ctaPath =
    primary.cnr || primary.matterId ? caseDetailHref(primary.cnr ?? "", primary.matterId) : "/dashboard/cases";
  return { data, ctaPath };
}
