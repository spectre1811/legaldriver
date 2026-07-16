// WO-29 W2 — pure inbox-status helpers (no I/O, so unit-testable). The statuses an email row that
// is still "in the inbox" can hold; archived/deleted are hidden from both lists but kept for undo.
export const INBOX_ACTIVE_STATUSES = ["pending", "filed", "needs_review"] as const;

// Group undo entries by their prior status → one UPDATE per status when restoring.
export function groupIdsByStatus(entries: { id: string; status: string }[]): Map<string, string[]> {
  const byStatus = new Map<string, string[]>();
  for (const e of entries) (byStatus.get(e.status) ?? byStatus.set(e.status, []).get(e.status)!).push(e.id);
  return byStatus;
}

// WO-170 — confidence band for the inbox pills/preview. Bands the raw 0–1 classifier score so
// the UI tints one way per band (green ≥ threshold, amber mid, red low/unknown) instead of
// showing a bare "0%". Threshold is the same CONFIDENCE_THRESHOLD the ingest pipeline files on.
export type ConfidenceBand = "high" | "medium" | "low";
export function confidenceBand(confidence: number | null | undefined, threshold: number): ConfidenceBand {
  if (confidence == null || confidence < 0.5) return "low";
  if (confidence >= threshold) return "high";
  return "medium";
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
