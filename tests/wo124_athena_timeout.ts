// WO-124 · athenaQuery must never read results off a still-RUNNING Athena query. The old inline poll
// ran a fixed 40×500ms and, on a cold/broad scan that outran it, FELL THROUGH to GetQueryResults on an
// unfinished query → AWS InvalidRequestException (INVALID_QUERY_EXECUTION_STATE), a confusing 500 on a
// user's first uncached judgments search. awaitAthenaDone now bounds the poll and throws a clean typed
// AthenaTimeoutError past the budget (the dashboard error boundary renders a handled retry state).
// Pure/offline: fetchState + sleep are injected, budget is a bounded max-poll count (no wall clock).
// Run: npx tsx tests/wo124_athena_timeout.ts
import { awaitAthenaDone, AthenaTimeoutError } from "../src/lib/court/corpus-athena";

let failures = 0;
const check = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failures++; };

// A sleeper that never really waits (keeps the test instant) but counts calls.
function fakeSleep() {
  let calls = 0;
  const fn = async (_ms: number) => { calls++; };
  return { fn, get calls() { return calls; } };
}

async function run() {
  // 1) Still RUNNING past the budget → AthenaTimeoutError, and it polled exactly maxPolls times
  //    (deadline 2500 / interval 500 = 5 polls), sleeping between but not after the last.
  {
    let polls = 0;
    const sleep = fakeSleep();
    let err: unknown = null;
    try {
      await awaitAthenaDone("q-run", async () => { polls++; return { state: "RUNNING" }; },
        { deadlineMs: 2500, intervalMs: 500, sleep: sleep.fn });
    } catch (e) { err = e; }
    check("timeout: throws AthenaTimeoutError", err instanceof AthenaTimeoutError);
    check("timeout: polled maxPolls (5) times", polls === 5);
    check("timeout: slept between polls only (4)", sleep.calls === 4);
    check("timeout: error carries the query id", (err as AthenaTimeoutError)?.queryId === "q-run");
    check("timeout: error carries waitedMs", (err as AthenaTimeoutError)?.waitedMs === 2500);
  }

  // 2) SUCCEEDED on the 2nd poll → resolves, no throw, stops polling immediately.
  {
    let polls = 0;
    const sleep = fakeSleep();
    let threw = false;
    try {
      await awaitAthenaDone("q-ok", async () => {
        polls++;
        return { state: polls >= 2 ? "SUCCEEDED" : "RUNNING" };
      }, { deadlineMs: 30_000, intervalMs: 500, sleep: sleep.fn });
    } catch { threw = true; }
    check("success: does not throw", !threw);
    check("success: stopped polling once SUCCEEDED (2)", polls === 2);
    check("success: slept once before the succeeding poll", sleep.calls === 1);
  }

  // 3) FAILED → throws with the AWS reason (NOT a timeout error).
  {
    let err: unknown = null;
    try {
      await awaitAthenaDone("q-fail", async () => ({ state: "FAILED", reason: "GENERIC_INTERNAL_ERROR: boom" }),
        { deadlineMs: 30_000, intervalMs: 500, sleep: async () => {} });
    } catch (e) { err = e; }
    check("failed: throws", err instanceof Error);
    check("failed: is NOT an AthenaTimeoutError", !(err instanceof AthenaTimeoutError));
    check("failed: surfaces the AWS reason", String((err as Error)?.message).includes("GENERIC_INTERNAL_ERROR: boom"));
  }

  // 4) CANCELLED → throws (state used as reason fallback).
  {
    let err: unknown = null;
    try {
      await awaitAthenaDone("q-cancel", async () => ({ state: "CANCELLED" }),
        { deadlineMs: 30_000, intervalMs: 500, sleep: async () => {} });
    } catch (e) { err = e; }
    check("cancelled: throws", err instanceof Error && !(err instanceof AthenaTimeoutError));
  }

  if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
  console.log("\nAll wo124_athena_timeout checks passed.");
}

run();
