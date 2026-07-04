// WO-36 · Unit tests for the pure QA-finding logic. No browser/LLM/network → runs anywhere with
// plain `node qa-agent/findings.test.mjs` (also wired as `npm run test:qa`).

import assert from "node:assert/strict";
import {
  findingHash,
  normalizeSummary,
  shouldFileIssue,
  dedupeAgainstExisting,
  rollupMarkdown,
  severityRank,
} from "./findings.mjs";

let n = 0;
const it = (name, fn) => {
  fn();
  n++;
  console.log(`✓ ${name}`);
};

it("normalizeSummary collapses whitespace + strips trailing punctuation + lowercases", () => {
  assert.equal(normalizeSummary("  Primary   button  is UNCLEAR.  "), "primary button is unclear");
});

it("findingHash is stable + insensitive to trivial summary drift, sensitive to route/type", () => {
  const a = { route: "/dashboard", type: "ux", summary: "Primary action unclear" };
  const b = { route: "/dashboard", type: "ux", summary: "primary action unclear." };
  const c = { route: "/dashboard/cases", type: "ux", summary: "Primary action unclear" };
  const d = { route: "/dashboard", type: "a11y", summary: "Primary action unclear" };
  assert.equal(findingHash(a), findingHash(b), "trivial wording/case/punct drift → same hash");
  assert.notEqual(findingHash(a), findingHash(c), "different route → different hash");
  assert.notEqual(findingHash(a), findingHash(d), "different type → different hash");
  assert.match(findingHash(a), /^[0-9a-f]{12}$/);
});

it("shouldFileIssue gates blocker/high only", () => {
  assert.equal(shouldFileIssue({ severity: "blocker" }), true);
  assert.equal(shouldFileIssue({ severity: "high" }), true);
  assert.equal(shouldFileIssue({ severity: "medium" }), false);
  assert.equal(shouldFileIssue({ severity: "low" }), false);
  assert.equal(shouldFileIssue({ severity: "nit" }), false);
});

it("severityRank orders worst-first", () => {
  assert.ok(severityRank("blocker") < severityRank("high"));
  assert.ok(severityRank("high") < severityRank("nit"));
  assert.ok(severityRank("bogus") >= severityRank("nit"));
});

it("dedupeAgainstExisting: fresh→file, known→comment, intra-run dupes collapse", () => {
  const f1 = { route: "/a", type: "bug", summary: "X breaks" };
  const f1dup = { route: "/a", type: "bug", summary: "x breaks." }; // same hash as f1
  const f2 = { route: "/b", type: "bug", summary: "Y breaks" };
  const existing = new Set([findingHash(f2)]);
  const { toFile, toComment } = dedupeAgainstExisting([f1, f1dup, f2], existing);
  assert.equal(toFile.length, 1, "f1 fresh (dup collapsed)");
  assert.equal(toFile[0].route, "/a");
  assert.equal(toComment.length, 1, "f2 already tracked → comment");
  assert.equal(toComment[0].route, "/b");
  assert.ok(toFile[0].hash && toComment[0].hash, "hash attached");
});

it("rollupMarkdown produces a scannable digest with a summary + sorted findings", () => {
  const md = rollupMarkdown(
    [
      { route: "/x", uxScore: 2, findings: [{ severity: "high", type: "bug", summary: "boom", repro: ["1. go /x"] }] },
      { route: "/y", uxScore: 5, findings: [] },
    ],
    { at: "2026-07-05" },
  );
  assert.match(md, /# QA sweep — 2026-07-05/);
  assert.match(md, /2 routes/);
  assert.match(md, /avg UX 3\.5\/5/);
  assert.match(md, /\| \/x \| 2 \|/);
  assert.match(md, /\[high\/bug\] \/x — boom/);
});

it("rollupMarkdown handles the zero-findings case", () => {
  const md = rollupMarkdown([{ route: "/x", uxScore: 5, findings: [] }], { at: "t" });
  assert.match(md, /_No findings\._/);
});

console.log(`\nPASS — ${n} tests`);
