// WO-170 · Inbox rebuild — pure-logic guards for the confidence band + the "confirm all
// high-confidence" filter, plus a structural check that the rebuilt surface keeps the
// pagination + combobox contracts the earlier sweeps (wo56/wo62) established.
// Run: npx tsx tests/wo170_inbox.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { confidenceBand, pickHighConfidenceIds } from "../src/lib/mail/inbox-status";

let failures = 0;
const check = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (e) {
    console.log(`FAIL  ${name} — ${(e as Error).message}`);
    failures++;
  }
};

const T = 0.8;

check("confidenceBand: ≥ threshold → high", () => {
  assert.equal(confidenceBand(0.8, T), "high");
  assert.equal(confidenceBand(0.95, T), "high");
});
check("confidenceBand: mid → medium", () => {
  assert.equal(confidenceBand(0.5, T), "medium");
  assert.equal(confidenceBand(0.79, T), "medium");
});
check("confidenceBand: low / unknown → low (never fabricate a band)", () => {
  assert.equal(confidenceBand(0.49, T), "low");
  assert.equal(confidenceBand(0, T), "low");
  assert.equal(confidenceBand(null, T), "low");
  assert.equal(confidenceBand(undefined, T), "low");
});

check("pickHighConfidenceIds: files only score≥threshold WITH a destination", () => {
  const ids = pickHighConfidenceIds(
    [
      { id: "a", confidence: 0.9, classified_matter_id: "m1", classified_client_id: null }, // yes
      { id: "b", confidence: 0.9, classified_matter_id: null, classified_client_id: "c1" }, // yes (client only)
      { id: "c", confidence: 0.9, classified_matter_id: null, classified_client_id: null }, // no — nowhere to file
      { id: "d", confidence: 0.6, classified_matter_id: "m2", classified_client_id: null }, // no — below threshold
      { id: "e", confidence: null, classified_matter_id: "m3", classified_client_id: null }, // no — unknown score
    ],
    T,
  );
  assert.deepEqual(ids, ["a", "b"]);
});

check("pickHighConfidenceIds: empty in → empty out", () => {
  assert.deepEqual(pickHighConfidenceIds([], T), []);
});

// ── Structural: the rebuilt page keeps the load-bearing contracts ────────────────────
const root = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const page = read("src/app/dashboard/inbox/page.tsx");
const workspace = read("src/app/dashboard/inbox/inbox-workspace.tsx");

check("page keeps range()+exact-count pagination (wo56 contract)", () => {
  assert.ok(/\.range\(\s*from\s*,\s*to\s*\)/.test(page), "range(from,to) missing");
  assert.ok(/count:\s*["']exact["']/.test(page), "exact count missing");
  assert.ok(/<Pagination\b/.test(page), "<Pagination> missing");
});
check("workspace files through the existing confirmEmail action (no new file path)", () => {
  assert.ok(/confirmEmail/.test(workspace), "confirmEmail not wired");
});
check("workspace uses the shared Combobox, not a raw <select> (wo62 contract)", () => {
  assert.ok(/from ["']@\/components\/combobox["']/.test(workspace) && /<Combobox\b/.test(workspace), "Combobox not adopted");
  assert.ok(!/<select[\s>]/.test(workspace), "raw <select> reintroduced");
});

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILED"}  (wo170_inbox)`);
process.exit(failures === 0 ? 0 : 1);
