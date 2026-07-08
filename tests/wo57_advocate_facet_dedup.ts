// WO-57 · Cases advocate/act facet — near-term variant collapsing.
// Guards:
//   (1) the normalizer merges surface-only variants (honorific/punctuation/whitespace/case) of one
//       advocate/act into a single group, and NEVER merges initial↔fullname (that needs BP-03);
//   (2) each group carries every raw variant so `.overlaps` (any-of) returns the whole entity;
//   (3) the facet is wired end-to-end: page groups the raw arrays; console renders grouped options
//       and expands the selection back to raw variants (query builder unchanged — still overlaps).
//
// Run: npx tsx tests/wo57_advocate_facet_dedup.ts

import { readFileSync } from "node:fs";
import { advocateKey, actKey, groupFacet, GROUP_SEP } from "../src/app/dashboard/cases/facet-normalize";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed++;
}
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// ── advocateKey: honorific + punctuation + whitespace + case are surface-only ────────────────
ok("punctuation variants share a key (P R PATEL == P.R.PATEL)", advocateKey("P R PATEL") === advocateKey("P.R.PATEL"));
ok("dotted-no-space normalizes to spaced tokens (P.R.PATEL == P. R. PATEL)", advocateKey("P.R.PATEL") === advocateKey("P. R. PATEL"));
ok("honorific stripped (MR YASH J PATEL == YASH J PATEL)", advocateKey("MR YASH J PATEL") === advocateKey("YASH J PATEL"));
ok("case + trailing whitespace folded", advocateKey("  shri  a. b. shah ") === advocateKey("SHRI A B SHAH"));
ok("multiple leading honorifics stripped (ADV. MR X Y == X Y)", advocateKey("ADV. MR X Y") === advocateKey("X Y"));

// ── never over-merge: initial↔fullname is a DIFFERENT entity (needs BP-03, must not be guessed) ──
ok("initial vs fullname stays distinct (Y J PATEL != YASH J PATEL)", advocateKey("Y J PATEL") !== advocateKey("YASH J PATEL"));
ok("different surnames stay distinct", advocateKey("P R PATEL") !== advocateKey("P R SHAH"));
ok("an all-honorific token is not keyed to empty", advocateKey("MR") !== "");
// honorific-stripping never folds down to a single token → no collision with a bare same-name advocate
ok("honorific + single name stays distinct (SRI RAM != RAM)", advocateKey("SRI RAM") !== advocateKey("RAM"));
ok("firm designator M/S is NOT stripped (M/S PATEL & CO != PATEL & CO)", advocateKey("M/S PATEL & CO") !== advocateKey("PATEL & CO"));
ok("a firm's own casing variants still merge (M/S PATEL & CO == m/s patel & co)", advocateKey("M/S PATEL & CO") === advocateKey("m/s patel & co"));

// ── actKey: casing/punctuation/whitespace only, NO honorific stripping ────────────────────────
ok("act punctuation/case folded (Indian Penal Code, 1860)", actKey("Indian Penal Code, 1860") === actKey("INDIAN PENAL CODE,1860"));
ok("act does not honorific-strip (a leading 'MR' token is kept as data)", actKey("MR Act 1961") !== actKey("Act 1961"));

// ── groupFacet: one option per entity, every raw variant preserved for the expanded match ────
const advGroups = groupFacet(["P.R.PATEL", "P R PATEL", "MR YASH J PATEL", "YASH J PATEL", "Y J PATEL"], advocateKey);
ok("5 raw advocate strings collapse to 3 real entities", advGroups.length === 3);
const patel = advGroups.find((g) => g.values.includes("P R PATEL"));
ok("the P R PATEL group holds BOTH punctuation variants", !!patel && patel.values.length === 2 && patel.values.includes("P.R.PATEL"));
ok("group label is the richest raw spelling (MR YASH J PATEL over YASH J PATEL)", !!advGroups.find((g) => g.label === "MR YASH J PATEL"));
ok("blanks/whitespace-only raw values are skipped", groupFacet(["", "   ", "A B"], advocateKey).length === 1);
ok("groups are sorted by label", advGroups.map((g) => g.label).join("|") === [...advGroups.map((g) => g.label)].sort().join("|"));
ok("GROUP_SEP is a control char (never occurs in a name/act)", GROUP_SEP.charCodeAt(0) === 0x1f);

// ── wiring: page.tsx builds grouped facets ───────────────────────────────────────────────────
const page = src("src/app/dashboard/cases/page.tsx");
ok("page imports the normalizer", /from "\.\/facet-normalize"/.test(page));
ok("page groups advocate_names with advocateKey", /groupFacet\(distinctArray\("advocate_names"\), advocateKey\)/.test(page));
ok("page groups act_names with actKey", /groupFacet\(distinctArray\("act_names"\), actKey\)/.test(page));
ok("page passes advocateGroups/actGroups to Console", /advocateGroups=\{advocateGroups\}/.test(page) && /actGroups=\{actGroups\}/.test(page));

// ── wiring: console renders grouped options + expands selection back to raw variants ─────────
const console_ = src("src/app/dashboard/cases/console.tsx");
ok("console takes FacetGroup props", /advocateGroups: FacetGroup\[\]/.test(console_) && /actGroups: FacetGroup\[\]/.test(console_));
ok("advocate/act use the grouped multi-select", /multiGrouped\("advocate"/.test(console_) && /multiGrouped\("act"/.test(console_));
ok("selecting a group expands to every raw variant (flatMap split on GROUP_SEP)", /setMulti\(key, vals\.flatMap\(\(v\) => v\.split\(GROUP_SEP\)\)\)/.test(console_));
ok("advocate/act stay MULTI keys (repeated URL params, unchanged)", /const MULTI = new Set<string>\(\[[^\]]*"advocate"[^\]]*"act"/.test(console_));

// ── wiring: the query builder still filters via array overlap (any-of) — unchanged ───────────
const query = src("src/app/dashboard/cases/cases-query.ts");
ok("advocate filter stays an array overlap (any-of match on all variants)", /query\.overlaps\("advocate_names", advocates\)/.test(query));
ok("act filter stays an array overlap", /query\.overlaps\("act_names", acts\)/.test(query));

console.log(failed === 0 ? "\nPASS" : `\nFAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
