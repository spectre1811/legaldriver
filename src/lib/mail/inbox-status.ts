// WO-29 W2 — pure inbox-status helpers (no I/O, so unit-testable). The statuses an email row that
// is still "in the inbox" can hold; archived/deleted are hidden from both lists but kept for undo.
export const INBOX_ACTIVE_STATUSES = ["pending", "filed", "needs_review"] as const;

// Group undo entries by their prior status → one UPDATE per status when restoring.
export function groupIdsByStatus(entries: { id: string; status: string }[]): Map<string, string[]> {
  const byStatus = new Map<string, string[]>();
  for (const e of entries) (byStatus.get(e.status) ?? byStatus.set(e.status, []).get(e.status)!).push(e.id);
  return byStatus;
}
