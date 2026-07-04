// Regression: the LD /timeline endpoint returns events with a null date (undated orders/hearings —
// verified live: 9/29 for GJHC240521152023). A bare `b.date.localeCompare(a.date)` throws on null,
// which crashed the entire case-detail page ("Something went wrong"). sortTimeline must not throw and
// must sink undated events to the bottom while keeping dated events reverse-chronological.
// Run: npx tsx tests/timeline_sort.ts
import { sortTimeline } from "../src/lib/court/timeline-sort";
import type { TimelineEvent } from "../src/lib/court/legaldriver-api";

let failures = 0;
const check = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failures++; };

const events: TimelineEvent[] = [
  { date: null, type: "order", order_id: 1 },
  { date: "2024-02-08", type: "hearing" },
  { date: null, type: "hearing" },
  { date: "2024-01-10", type: "hearing" },
  { date: "2024-01-10", type: "order", order_id: 2 },
];

let sorted: TimelineEvent[] = [];
let threw = false;
try { sorted = sortTimeline(events); } catch { threw = true; }

check("does not throw on null dates", !threw);
check("newest dated event first", sorted[0]?.date === "2024-02-08");
check("undated events sink to the bottom", sorted.slice(-2).every((e) => e.date == null));
check("same-date order ranks after its hearing", (() => {
  const i = sorted.findIndex((e) => e.date === "2024-01-10" && e.type === "order");
  const j = sorted.findIndex((e) => e.date === "2024-01-10" && e.type === "hearing");
  return i > -1 && j > -1 && i < j; // order is "more recent" on a shared date → earlier in reverse-chron
})());
check("no events dropped", sorted.length === events.length);

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log("\nAll timeline_sort checks passed.");
