// WO-54 W2b · Tier-aware facets + Judge filter. Guards:
//   (1) the facet option lists are scoped to the active tier (facets adapt per HC/District);
//   (2) judge filtering still works end-to-end at the QUERY layer (array-column overlap, any-of,
//       like advocate/act) — a saved view or a hand-built URL that sets `?judge=…` still filters.
//
// WO-331 EXACT-FIDELITY RECONCILE: the Judge (and Advocate/Act/raw-status) facet EDITING UI was
// deliberately dropped from cases-toolbar.tsx's Filters sheet — the reference
// (design-mockups/iteration3/console/cases.tsx) has no slot for it (only Court/Case type/Stage/Next
// hearing). The underlying capability is untouched (cases-query.ts, CASE_MULTI/VIEW_KEYS), so an
// existing saved view that references `judge` still filters correctly — see cases-toolbar.tsx's
// file-level trade-off note. This file's old assertions ("toolbar accepts a judges prop", "the
// Filters sheet renders the Judge facet") asserted the UI that's now intentionally gone; replaced
// with assertions that it does NOT reintroduce, so a future PR can't silently un-do the decision
// without touching this test (forcing a deliberate choice, not an accident).
//
// Run: npx tsx tests/wo54_facets.ts

import { readFileSync } from "node:fs";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed++;
}
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// ── tier-scoped facet option lists ───────────────────────────────────────────
const page = src("src/app/dashboard/cases/page.tsx");
ok("facet query is scoped to the active tier", /if \(tier\) facetQuery = facetQuery\.eq\("tier", tier\)/.test(page));
ok("facet query no longer selects judge_names (WO-331: no editing UI for it)", !/facetQuery = supabase\.from\("matter"\)\.select\([^)]*judge_names/.test(page));

// ── Judge filter (query layer — unchanged, still reachable via URL / saved views) ───────────────
const query = src("src/app/dashboard/cases/cases-query.ts");
ok("CasesFilters still has a judge field", /judge\?: string \| string\[\]/.test(query));
ok("judge still filters via array overlap (any-of, like advocate/act)", /query\.overlaps\("judge_names", judges\)/.test(query));

// ── Judge facet UI (WO-331: intentionally NOT in the toolbar's Filters sheet) ───────────────────
const toolbar = src("src/app/dashboard/cases/cases-toolbar.tsx");
const nav = src("src/app/dashboard/cases/cases-nav.ts");
ok("toolbar does not (re)introduce a judges prop", !/judges: string\[\]/.test(toolbar));
ok("judge stays a valid multi-select key at the nav layer (existing saved views still apply it)", /CASE_MULTI = new Set<string>\(\[[^\]]*"judge"/.test(nav));
ok("judge stays in the saved-view replay keys", /VIEW_KEYS = \[[^\]]*"judge"/.test(nav));
ok("the Filters sheet does not render a Judge facet control", !/tc\("judge"\)/.test(toolbar));

console.log(failed === 0 ? "\nPASS" : `\nFAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
