// WO-29 W2 — pure inbox-status helpers (no I/O, so unit-testable). The statuses an email row that
// is still "in the inbox" can hold; archived/deleted are hidden from both lists but kept for undo.
export const INBOX_ACTIVE_STATUSES = ["pending", "filed", "needs_review"] as const;

// Group undo entries by their prior status → one UPDATE per status when restoring.
export function groupIdsByStatus(entries: { id: string; status: string }[]): Map<string, string[]> {
  const byStatus = new Map<string, string[]>();
  for (const e of entries) (byStatus.get(e.status) ?? byStatus.set(e.status, []).get(e.status)!).push(e.id);
  return byStatus;
}

// WO-170 — the filing confidence threshold, read from env but validated: an unset/blank/garbage
// CONFIDENCE_THRESHOLD must NOT coerce to 0 (which would mass-file the whole review queue) or NaN
// (which would file nothing). Only a real number in (0,1] is honoured; anything else → 0.8.
export function resolveThreshold(raw: string | undefined | null): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : 0.8;
}

// WO-170 — confidence band for the inbox pills/preview. Bands the raw 0–1 classifier score so
// the UI tints one way per band instead of showing a bare "0%". Bands are RELATIVE to the filing
// threshold so they never contradict it: high = at/above the threshold (will auto-file), low =
// well under it, medium = approaching it. (A fixed 0.5 floor would paint an at-threshold email
// "low" whenever the threshold is configured below 0.5.)
export type ConfidenceBand = "high" | "medium" | "low";
export function confidenceBand(confidence: number | null | undefined, threshold: number): ConfidenceBand {
  if (confidence == null) return "low";
  if (confidence >= threshold) return "high";
  if (confidence >= threshold * 0.5) return "medium";
  return "low";
}

// WO-170 — start of "today" in IST (the product's audience; fixed UTC+5:30, no DST), returned as
// a UTC ISO instant so `created_at >= it` counts the user's calendar day, not the server's UTC day.
export function istDayStartIso(nowMs: number): string {
  const IST = 5.5 * 60 * 60 * 1000;
  const istMidnight = Math.floor((nowMs + IST) / 86_400_000) * 86_400_000 - IST;
  return new Date(istMidnight).toISOString();
}

// WO-170 — the emails "Confirm all high-confidence" will file: score ≥ threshold AND the
// classifier already has a case (matter) or client to file them under. A high score with no
// suggested destination isn't fileable, so it stays in review — never file to nowhere.
export function pickHighConfidenceIds(
  emails: { id: string; confidence: number | null; classified_matter_id: string | null; classified_client_id: string | null }[],
  threshold: number,
): string[] {
  return emails
    .filter((e) => e.confidence != null && e.confidence >= threshold && (e.classified_matter_id || e.classified_client_id))
    .map((e) => e.id);
}
