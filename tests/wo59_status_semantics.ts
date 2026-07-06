// WO-59 W1 · Cases status-filter semantics. The bug: `status` is free-text eCourts data
// ("Pending"/"Disposed"/NULL/…), but the old code did an exact `.eq("status","open")` in BOTH the
// list query and the tab count — so "Open" showed a count while the filtered list held phantom/zero
// rows. Guards:
//   (1) planStatusFilter maps the two semantic groupings to the SAME substring rules the WO-56
//       portfolio dashboard uses, and treats any other value as exact real statuses (multi via `.in`);
//   (2) buildCasesQuery routes `status` through it — never a raw `.eq("status",…)`;
//   (3) fetchViewCounts counts "open"/"disposed" through the identical filter, so a count can never
//       disagree with the rows its tab shows.
//
// Run: npx tsx tests/wo59_status_semantics.ts

import {
  planStatusFilter,
  buildCasesQuery,
  fetchViewCounts,
  OPEN_STATUS_OR,
  DISPOSED_STATUS_OR,
} from "../src/app/dashboard/cases/cases-query";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed++;
}

// ── 1. planStatusFilter (pure) ───────────────────────────────────────────────
ok("no status → no filter", planStatusFilter(undefined) === null);
ok("empty string → no filter", planStatusFilter("") === null);
ok("commas-only → no filter", planStatusFilter(" , ") === null);

const open = planStatusFilter("open");
ok("open → OR filter", open?.kind === "or" && open.filter === OPEN_STATUS_OR);
ok("open OR includes NULL", OPEN_STATUS_OR.includes("status.is.null"));
ok("open OR excludes disposed", OPEN_STATUS_OR.includes("status.not.ilike.*dispos*"));
ok("open OR excludes closed", OPEN_STATUS_OR.includes("status.not.ilike.*closed*"));

const disp = planStatusFilter("disposed");
ok("disposed → OR filter", disp?.kind === "or" && disp.filter === DISPOSED_STATUS_OR);
ok("disposed OR matches disposed", DISPOSED_STATUS_OR.includes("status.ilike.*dispos*"));
ok("disposed OR matches closed", DISPOSED_STATUS_OR.includes("status.ilike.*closed*"));

const single = planStatusFilter("Pending");
ok("real single value → IN [value]", single?.kind === "in" && single.values.length === 1 && single.values[0] === "Pending");

const multi = planStatusFilter("Pending, Disposed ,Contested");
ok("real multi values → IN, trimmed", multi?.kind === "in" && multi.values.join("|") === "Pending|Disposed|Contested");

// ── 2. recording mock: the query builder never uses a raw `.eq("status", …)` ──
type Call = [string, unknown[]];
function makeSupabase(calls: Call[]) {
  const builder: Record<string, unknown> = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "then") return (resolve: (v: unknown) => void) => resolve({ count: 0 });
        return (...args: unknown[]) => {
          calls.push([prop, args]);
          return builder;
        };
      },
    },
  );
  return { from: () => builder } as never;
}

function statusCalls(status: string): Call[] {
  const calls: Call[] = [];
  buildCasesQuery(makeSupabase(calls), { status });
  return calls;
}

const openCalls = statusCalls("open");
ok("buildCasesQuery(open) applies the OR filter", openCalls.some((c) => c[0] === "or" && c[1][0] === OPEN_STATUS_OR));
ok("buildCasesQuery(open) never does eq(status)", !openCalls.some((c) => c[0] === "eq" && c[1][0] === "status"));

const dispCalls = statusCalls("disposed");
ok("buildCasesQuery(disposed) applies the OR filter", dispCalls.some((c) => c[0] === "or" && c[1][0] === DISPOSED_STATUS_OR));

const realCalls = statusCalls("Pending,Disposed");
ok("buildCasesQuery(real) uses IN(status, values)", realCalls.some((c) => c[0] === "in" && c[1][0] === "status"));
ok("buildCasesQuery(real) never does eq(status)", !realCalls.some((c) => c[0] === "eq" && c[1][0] === "status"));

// ── 2b. multi-select facet filters — repeated params → `.in` / `.overlaps`, never `.eq` ──
function filterCalls(f: Record<string, unknown>): Call[] {
  const calls: Call[] = [];
  buildCasesQuery(makeSupabase(calls), f as never);
  return calls;
}
const has = (calls: Call[], m: string, col: string, val?: unknown) =>
  calls.some((c) => c[0] === m && c[1][0] === col && (val === undefined || JSON.stringify(c[1][1]) === JSON.stringify(val)));

// Scalar columns → `.in` (OR within a facet), single or multi, and never the old `.eq`.
const courtMulti = filterCalls({ court: ["HC", "District"] });
ok("court[] → in(court, [..])", has(courtMulti, "in", "court", ["HC", "District"]));
ok("court[] never eq(court)", !courtMulti.some((c) => c[0] === "eq" && c[1][0] === "court"));
ok("single court string → in(court, [one])", has(filterCalls({ court: "HC" }), "in", "court", ["HC"]));
ok("case_type[] → in(case_type)", has(filterCalls({ case_type: ["SCA", "CC"] }), "in", "case_type", ["SCA", "CC"]));
ok("stage[] → in(stage)", has(filterCalls({ stage: ["Hearing"] }), "in", "stage", ["Hearing"]));
ok("statuses[] → in(status)", has(filterCalls({ statuses: ["Pending", "Contested"] }), "in", "status", ["Pending", "Contested"]));

// Array columns → `.overlaps` (row shares ≥1 picked value), never the old single-value `.contains`.
const advMulti = filterCalls({ advocate: ["A. Sharma", "B. Patel"] });
ok("advocate[] → overlaps(advocate_names)", has(advMulti, "overlaps", "advocate_names", ["A. Sharma", "B. Patel"]));
ok("advocate[] never contains(advocate_names)", !advMulti.some((c) => c[0] === "contains"));
ok("act[] → overlaps(act_names)", has(filterCalls({ act: ["Indian Penal Code, 1860"] }), "overlaps", "act_names", ["Indian Penal Code, 1860"]));
// Empty / whitespace-only multi params add no filter (no phantom `.in [""]`).
const empties = filterCalls({ court: ["", "  "], advocate: [] });
ok("blank multi values add no court filter", !empties.some((c) => c[0] === "in" && c[1][0] === "court"));
ok("empty advocate array adds no overlaps", !empties.some((c) => c[0] === "overlaps"));

// ── 3. fetchViewCounts routes open/disposed through the same filter ──────────
async function main() {
  const calls: Call[] = [];
  const counts = await fetchViewCounts(makeSupabase(calls));
  ok("counts expose open + disposed keys", "open" in counts && "disposed" in counts);
  ok("counts still expose the urgency buckets (Attention bar)", "overdue" in counts && "soon" in counts && "noDate" in counts);
  ok("view counts count open via the OR filter", calls.some((c) => c[0] === "or" && c[1][0] === OPEN_STATUS_OR));
  ok("view counts count disposed via the OR filter", calls.some((c) => c[0] === "or" && c[1][0] === DISPOSED_STATUS_OR));
  ok("view counts never eq(status,'open')", !calls.some((c) => c[0] === "eq" && c[1][0] === "status" && c[1][1] === "open"));

  if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log("\nall checks passed");
}
void main();
