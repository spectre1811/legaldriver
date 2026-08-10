// WO-57 · Cases advocate/act facet — near-term variant collapsing.
// Guards:
//   (1) the normalizer merges surface-only variants (honorific/punctuation/whitespace/case) of one
//       advocate/act into a single group, and NEVER merges initial↔fullname (that needs BP-03);
//   (2) each group carries every raw variant so `.overlaps` (any-of) returns the whole entity;
//   (3) the query builder still filters via array overlap (any-of), unchanged.
//
// WO-331 EXACT-FIDELITY RECONCILE: the Advocate/Act facet EDITING UI (page.tsx's grouped-facet
// wiring, cases-toolbar.tsx's grouped multi-select) was deliberately dropped — the reference
// (design-mockups/iteration3/console/cases.tsx) has no slot for it. The pure normalizer above is
// unaffected (kept — it's real, tested, reusable logic) and still exercised directly here; only the
// page/toolbar "wiring" assertions below changed, from asserting the UI exists to asserting it
// doesn't quietly come back without a deliberate test update. See cases-toolbar.tsx's file-level
// trade-off note.
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

// ── WO-331: page.tsx no longer builds grouped facets (no UI consumes them) ──────────────────
const page = src("src/app/dashboard/cases/page.tsx");
ok("page no longer imports the normalizer (no consumer left)", !/from "\.\/facet-normalize"/.test(page));
ok("page no longer groups advocate_names/act_names (dropped with the UI)", !/groupFacet\(distinctArray\(/.test(page));

// ── WO-331: the Filters sheet no longer renders the grouped advocate/act multi-select ────────
const toolbar = src("src/app/dashboard/cases/cases-toolbar.tsx");
const nav = src("src/app/dashboard/cases/cases-nav.ts");
ok("toolbar does not (re)introduce FacetGroup props", !/FacetGroup\[\]/.test(toolbar));
ok("toolbar does not (re)introduce the grouped multi-select", !/multiGrouped\(/.test(toolbar));
ok("advocate/act stay MULTI keys at the nav layer (existing saved views still apply them)", /CASE_MULTI = new Set<string>\(\[[^\]]*"advocate"[^\]]*"act"/.test(nav));

// ── wiring: the query builder still filters via array overlap (any-of) — unchanged ───────────
const query = src("src/app/dashboard/cases/cases-query.ts");
ok("advocate filter stays an array overlap (any-of match on all variants)", /query\.overlaps\("advocate_names", advocates\)/.test(query));
ok("act filter stays an array overlap", /query\.overlaps\("act_names", acts\)/.test(query));

console.log(failed === 0 ? "\nPASS" : `\nFAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
