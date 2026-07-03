// WO-01 Wave 2: watermark-aware refresh ordering. Pure/offline — no DB/network.
// Asserts: pending/urgent before future-dated before disposed; stalest-first within a tier;
// never-synced sorts to the front; the run cap defers the overflow (no silent drop).
// Run: npx tsx tests/wo01_refresh_priority.ts
import { orderForRefresh, refreshTier, type RefreshCandidate } from "@/lib/court/refresh-priority";

const NOW = Date.parse("2026-07-03T00:00:00Z");
const day = (n: number) => new Date(NOW + n * 86_400_000).toISOString();

function c(id: string, over: Partial<RefreshCandidate>): RefreshCandidate {
  return { id, cnr: id, tenant_id: "t", next_hearing_date: null, last_synced_at: null, status: "active", ...over };
}

let failed = 0;
const ok = (cond: boolean, msg: string) => { if (!cond) { console.error("  FAIL:", msg); failed++; } else console.log("  ✓", msg); };

// Tiers
ok(refreshTier(c("a", { next_hearing_date: day(2) }), NOW) === 0, "active + hearing in 2 days = tier 0 (urgent)");
ok(refreshTier(c("b", { next_hearing_date: day(-5) }), NOW) === 0, "active + overdue hearing = tier 0");
ok(refreshTier(c("c", { next_hearing_date: null }), NOW) === 0, "active + no next date = tier 0");
ok(refreshTier(c("d", { next_hearing_date: day(30) }), NOW) === 1, "active + far-future hearing = tier 1");
ok(refreshTier(c("e", { status: "Disposed", next_hearing_date: day(1) }), NOW) === 2, "disposed = tier 2 even if dated soon");

// Ordering + cap
const cands = [
  c("disposed_stale", { status: "Disposed off", last_synced_at: day(-40) }),
  c("future_fresh", { next_hearing_date: day(20), last_synced_at: day(-1) }),
  c("urgent_fresh", { next_hearing_date: day(1), last_synced_at: day(-1) }),
  c("urgent_stale", { next_hearing_date: day(1), last_synced_at: day(-10) }),
  c("urgent_never", { next_hearing_date: day(2), last_synced_at: null }),
];
const { ordered, deferred } = orderForRefresh(cands, NOW, 100);
const ids = ordered.map((m) => m.id);
ok(ids[0] === "urgent_never", `never-synced urgent first (got ${ids[0]})`);
ok(ids[1] === "urgent_stale" && ids[2] === "urgent_fresh", "within urgent tier: stalest before fresh");
ok(ids[3] === "future_fresh", "future-dated (tier 1) after all urgent");
ok(ids[4] === "disposed_stale", "disposed (tier 2) last even though stalest overall");
ok(deferred === 0, "no deferral when cap ≥ count");

// Cap defers the overflow (lowest-priority tail), reported not dropped
const capped = orderForRefresh(cands, NOW, 3);
ok(capped.ordered.length === 3 && capped.deferred === 2, "cap=3 → 3 refreshed, 2 deferred");
ok(!capped.ordered.some((m) => m.id === "disposed_stale"), "deferred tail is the lowest-priority (disposed) case");

// Tenant fairness: a bulk-import tenant (many tier-0 never-synced) must NOT starve another
// tenant's urgent case. Round-robin within the urgent tier surfaces small-tenant B early.
const cb = (id: string, tenant: string) => c(id, { tenant_id: tenant, next_hearing_date: day(1), last_synced_at: null });
const many = [cb("A1", "A"), cb("A2", "A"), cb("A3", "A"), cb("A4", "A"), cb("A5", "A"), cb("B1", "B")];
const fair = orderForRefresh(many, NOW, 2);
ok(fair.ordered.some((m) => m.id === "B1"), "tenant B's urgent case is NOT starved by tenant A's bulk import (round-robin within tier)");

console.log(failed === 0 ? "\nWO-01 REFRESH PRIORITY: PASS" : `\nWO-01 REFRESH PRIORITY: FAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
