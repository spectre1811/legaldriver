// WO-54 W3 · Pure helpers for the richer Cases row — no React, no i18n, unit-tested. They turn the
// row's real fields into the two at-a-glance signals a litigator scans first: "when is this due"
// (urgency) and "for what / which court-scoped number" (case no.). Both derive strictly from stored
// values — an absent input yields a null/`none`, never a fabricated label (information-integrity).

// ── Next-hearing urgency ─────────────────────────────────────────────────────────────────────────
// `eff` is the effective next-hearing day (diary override beats the court date), `today` an ISO day
// (both `YYYY-MM-DD`). We diff whole days off the ISO strings (UTC midnights) so there's no TZ drift
// or day-roll — the exact bug the court kit's `fmtDate` replacement exists to kill.
export type UrgencyKey = "overdue" | "today" | "tomorrow" | "soon" | "future" | "none";
export interface HearingUrgency {
  key: UrgencyKey;
  /** Signed whole days from today to the hearing (negative = past). null when there's no date. */
  days: number | null;
}

const DAY_MS = 86_400_000;

/** Whole days from ISO day `a` to ISO day `b` (b − a); null if either isn't a valid `YYYY-MM-DD`. */
export function isoDayDiff(a: string, b: string): number | null {
  const pa = parseIsoDay(a);
  const pb = parseIsoDay(b);
  if (pa == null || pb == null) return null;
  return Math.round((pb - pa) / DAY_MS);
}

function parseIsoDay(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(t) ? null : t;
}

export function hearingUrgency(eff: string | null | undefined, today: string): HearingUrgency {
  if (!eff) return { key: "none", days: null };
  const days = isoDayDiff(today, eff);
  if (days == null) return { key: "none", days: null };
  if (days < 0) return { key: "overdue", days };
  if (days === 0) return { key: "today", days };
  if (days === 1) return { key: "tomorrow", days };
  if (days <= 7) return { key: "soon", days };
  return { key: "future", days };
}

/** Chip tone for an urgency key (maps to the court kit's ChipTone). `future`/`none` → no chip. */
export function urgencyTone(key: UrgencyKey): "danger" | "hot" | "warn" | null {
  switch (key) {
    case "overdue": return "danger";
    case "today": return "hot";
    case "tomorrow":
    case "soon": return "warn";
    default: return null;
  }
}

// ── Court-scoped case number ─────────────────────────────────────────────────────────────────────
// Compose the number an advocate recognises (e.g. "SCA/9465/2023") from the case-type code + the
// registration (or filing) number already on the record. Defensive: if the number already carries a
// `/YYYY` we don't double-append the year; with no type we return the bare number; with no number we
// return null (→ the row falls back to the CNR). We never invent a number that isn't stored.
export function courtCaseNo(
  caseType: string | null | undefined,
  detail: Record<string, unknown>,
): string | null {
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const num = s(detail.registrationNumber) ?? s(detail.filingNumber);
  if (!num) return null;
  const ct = s(caseType);
  if (!ct) return num;
  if (/\/\d{4}$/.test(num)) return `${ct}/${num}`; // number already ends with the year
  const yr = detail.registrationYear != null ? String(detail.registrationYear) : null;
  return yr ? `${ct}/${num}/${yr}` : `${ct}/${num}`;
}
