// WO-286: cron live-refresh lane decision logic. Pure/offline — no DB/network.
// Asserts: env parsing + the REFRESH_LIVE_MAX_PER_RUN=0 kill switch; the per-call deadline
// clamps to [1s, 15s] and tracks the remaining budget; the budget gate; and that the lane
// consumes the GLOBAL priority order (cross-tenant — the review defect) with the remainder
// regrouped per tenant, nothing double-processed, nothing dropped.
// Run: npx tsx tests/wo286_live_lane.ts
import { groupRemaining, liveBudgetOpen, liveDeadlineMs, liveLaneSize } from "@/lib/court/live-lane";

let failed = 0;
const ok = (cond: boolean, msg: string) => { if (!cond) { console.error("  FAIL:", msg); failed++; } else console.log("  ✓", msg); };

// --- liveLaneSize: env parsing + kill switch ---
ok(liveLaneSize(undefined) === 8, "unset → default 8");
ok(liveLaneSize("0") === 0, "'0' → 0 (kill switch)");
ok(liveLaneSize("3") === 3, "'3' → 3");
ok(liveLaneSize("2.9") === 2, "fractional floors");
ok(liveLaneSize("-4") === 0, "negative clamps to 0");
ok(liveLaneSize("banana") === 0, "garbage → 0 (lane off, fail-safe)");

// --- liveBudgetOpen: gate semantics ---
ok(liveBudgetOpen(1, 0, 25_000), "slots + fresh clock → open");
ok(!liveBudgetOpen(0, 0, 25_000), "no slots → closed");
ok(!liveBudgetOpen(5, 25_000, 25_000), "budget exhausted → closed");
ok(!liveBudgetOpen(5, 0, NaN), "NaN budget → closed (lane never runs)");

// --- liveDeadlineMs: clamped remaining budget ---
ok(liveDeadlineMs(25_000, 0) === 15_000, "full budget → capped at 15s (never the adapter's 60s)");
ok(liveDeadlineMs(25_000, 20_000) === 5_000, "5s left → 5s deadline");
ok(liveDeadlineMs(25_000, 24_900) === 1_000, "budget edge → 1s floor, never 0/negative");

// --- lane consumes GLOBAL order; remainder regroups per tenant, no loss, no dupes ---
type C = { tenant_id: string; cnr: string };
// orderForRefresh's output shape: cross-tenant round-robin — tenant A's rank-1, B's rank-1, A's rank-2…
const ordered: C[] = [
  { tenant_id: "A", cnr: "A1" }, { tenant_id: "B", cnr: "B1" },
  { tenant_id: "A", cnr: "A2" }, { tenant_id: "B", cnr: "B2" },
  { tenant_id: "A", cnr: "A3" },
];
// Simulate the route's lane: consume from the head of `ordered` (identity into the done-set).
const done = new Set<C>();
let slots = 2;
for (const m of ordered) { if (slots <= 0) break; slots--; done.add(m); }
ok([...done].map((m) => m.cnr).join(",") === "A1,B1",
   "lane takes the global top-K across tenants (A1,B1 — not A1,A2)");
const grouped = groupRemaining(ordered, done);
ok((grouped.get("A") ?? []).map((m) => m.cnr).join(",") === "A2,A3", "tenant A remainder in order");
ok((grouped.get("B") ?? []).map((m) => m.cnr).join(",") === "B2", "tenant B remainder in order");
const total = [...grouped.values()].reduce((n, l) => n + l.length, 0);
ok(total + done.size === ordered.length, "nothing dropped, nothing double-processed");
// kill switch → lane consumes nothing, grouping = everything
const groupedAll = groupRemaining(ordered, new Set<C>());
ok([...groupedAll.values()].reduce((n, l) => n + l.length, 0) === ordered.length,
   "lane off → cached path sees every row (old behavior)");

console.log(failed === 0 ? "PASS wo286_live_lane" : `FAIL wo286_live_lane — ${failed}`);
process.exit(failed ? 1 : 0);
