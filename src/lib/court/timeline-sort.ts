import type { TimelineEvent } from "./legaldriver-api";

// On a shared date, an order/process follows the hearing that produced it, so it ranks later.
const SEQ: Record<string, number> = { hearing: 1, process: 2, order: 3 };

// Reverse-chronological. The /timeline source can return events with a null date (undated
// orders/hearings — verified live). A bare `b.date.localeCompare(a.date)` throws on null and
// crashed the whole case page; guarding the comparator sinks undated events to the bottom instead.
export function sortTimeline(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort(
    (a, b) => (b.date ?? "").localeCompare(a.date ?? "") || (SEQ[b.type] ?? 0) - (SEQ[a.type] ?? 0),
  );
}
