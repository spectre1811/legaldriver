// WO-286: cron live-refresh lane decision logic + streaming persistence. Offline — no real DB/network
// (the supabase client below is a hand-built literal mock matching upsertCase's exact call shape,
// same convention as tests/wo288_email_sendpath.ts's `sbWith`).
// Asserts: env parsing + the REFRESH_LIVE_MAX_PER_RUN=0 kill switch; the per-call deadline clamps to
// [1s, 25s] (W2: was [1s,15s]) and tracks the remaining budget; the budget gate; and — the W2
// streaming fix — that `persistOne` upserts EACH case the instant its own fetch resolves, so a case
// persisted this run survives a kill before the next candidate's fetch even starts (never the old
// collect-a-batch-then-write shape that persisted nothing on a mid-batch kill).
// Run: npx tsx tests/wo286_live_lane.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { liveBudgetOpen, liveDeadlineMs, liveLaneSize, persistOne } from "@/lib/court/live-lane";
import type { RefreshCandidate } from "@/lib/court/refresh-priority";
import type { CaseFetch } from "@/lib/court/gateway";

let failed = 0;
const ok = (cond: boolean, msg: string) => { if (!cond) { console.error("  FAIL:", msg); failed++; } else console.log("  ✓", msg); };

async function main() {
// --- liveLaneSize: env parsing + kill switch (W2: default 3, was 8) ---
ok(liveLaneSize(undefined) === 3, "unset → default 3 (W2: was 8)");
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

// --- liveDeadlineMs: clamped remaining budget (W2: ceiling 25s, was 15s) ---
ok(liveDeadlineMs(25_000, 0) === 25_000, "full 25s budget, fresh clock → 25s deadline (W2: was capped at 15s)");
ok(liveDeadlineMs(25_000, 20_000) === 5_000, "5s left → 5s deadline");
ok(liveDeadlineMs(25_000, 24_900) === 1_000, "budget edge → 1s floor, never 0/negative");
ok(liveDeadlineMs(40_000, 0) === 25_000, "a LARGER configured budget still caps at 25s — real ceiling, not just today's default matching up");

// --- persistOne: STREAMS — each case upserts the instant its own fetch resolves (W2 fix) ---
// Mock supabase covers exactly the calls a brand-new matter (no hearings/orders/next-date) makes
// in sync.ts::upsertCase: matter existence check (miss) → matter insert → hearing/court_order
// delete (nothing to insert) → notification delete (nothing scheduled, no nextHearingDate).
{
  const events: string[] = [];
  type Row = Record<string, unknown>;
  const admin = {
    from(table: string) {
      if (table === "matter") {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
          insert: (row: Row) => {
            events.push(`write:${row.cnr}`); // the DB write happens HERE — synchronously with the call
            return { select: () => ({ single: async () => ({ data: { id: `m-${row.cnr}` }, error: null }) }) };
          },
        };
      }
      if (table === "hearing" || table === "court_order") return { delete: () => ({ eq: async () => ({ error: null }) }) };
      if (table === "notification") return { delete: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ contains: async () => ({ error: null }) }) }) }) }) };
      throw new Error(`unexpected table in persistOne streaming test: ${table}`);
    },
  } as unknown as SupabaseClient<Database>;

  const delays: Record<string, number> = { S1: 30, S2: 10, S3: 20 }; // deliberately non-monotonic
  const fetchFor = (cnr: string) => (): Promise<CaseFetch> =>
    new Promise((resolve) => {
      events.push(`fetch:${cnr}`);
      setTimeout(() => resolve({
        case: { cnr, title: `Case ${cnr}`, parties: [], hearings: [], orders: [], source: "mock", fetchedAt: new Date().toISOString(), nextHearingDate: null },
        cacheHit: false, stale: false, source: "mock",
      }), delays[cnr]);
    });

  async function run() {
    const outcomes: string[] = [];
    for (const cnr of ["S1", "S2", "S3"]) {
      const m: RefreshCandidate = { id: cnr, cnr, tenant_id: "t1", next_hearing_date: null, last_synced_at: null, status: "active" };
      const r = await persistOne(admin, m, fetchFor(cnr));
      outcomes.push(r.outcome);
    }
    ok(outcomes.every((o) => o === "refreshed"), "persistOne: all three genuinely-fresh cases report 'refreshed'");
    // The proof: each write happens right after ITS OWN fetch, before the NEXT candidate's fetch
    // starts — even though S1 (processed first) has the LONGEST artificial delay (30ms > S2/S3's
    // 10/20ms). Under the old batch-then-write shape this would instead read
    // "fetch:S1,fetch:S2,fetch:S3,write:S1,write:S2,write:S3" — a kill after "write:S1" here would
    // have persisted NOTHING in that shape, whereas in the streamed shape S1 is already durable.
    ok(events.join(",") === "fetch:S1,write:S1,fetch:S2,write:S2,fetch:S3,write:S3",
      `streaming order proven — kill-after-first-write loses nothing already written (got: ${events.join(",")})`);
  }
  await run();
}

// --- route wiring (source): the streaming fix + W2 tuning landed where they should ---
{
  const src = (p: string) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), "utf8");
  const route = src("src/app/api/cron/refresh/route.ts");
  ok(!route.includes("refreshCasesCached"), "route: old batch-collect-then-write path is gone");
  ok(!/\.slice\(i, i \+ 50\)/.test(route), "route: no more 50-case batching window");
  ok(route.includes("persistOne(supabase, m,"), "route: both lanes stream through the shared persistOne");
  ok(route.includes('?? "100"'), "route: REFRESH_MAX_PER_RUN default is 100 (W2: was 600)");
  ok(route.includes("RUN_DEADLINE_MS"), "route: wall-clock deadline guard exists (honest partial run, not a silent 60s kill)");
  ok(route.includes('provider: "refresh-cron"') && route.includes("court_provider_health"),
    "route: run-summary written to the court_provider_health dead-man surface");
  ok(route.includes("hitDeadline") && route.includes("durationMs") && route.includes("skipped") && route.includes("liveRefreshed"),
    "route: response JSON carries the full run-summary shape");
}

console.log(failed === 0 ? "PASS wo286_live_lane" : `FAIL wo286_live_lane — ${failed}`);
process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
