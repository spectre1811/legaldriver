// WO-54 W2b · Tier-aware facets + Judge filter. Guards:
//   (1) the facet option lists are scoped to the active tier (facets adapt per HC/District);
//   (2) a Judge facet exists end-to-end (filter → console dropdown → distinct source);
//   (3) judge filtering uses the array-column overlap (any-of), like advocate/act.
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
ok("facet query selects judge_names", /facetQuery = supabase\.from\("matter"\)\.select\([^)]*judge_names/.test(page));
ok("judges distinct list computed + passed to Console", /const judges = distinctArray\("judge_names"\)/.test(page) && /judges=\{judges\}/.test(page));

// ── Judge filter (query) ─────────────────────────────────────────────────────
const query = src("src/app/dashboard/cases/cases-query.ts");
ok("CasesFilters has a judge field", /judge\?: string \| string\[\]/.test(query));
ok("judge filters via array overlap (any-of, like advocate/act)", /query\.overlaps\("judge_names", judges\)/.test(query));

// ── Judge facet (WO-147 W2: the facets live in the toolbar's Filters sheet now) ─
const toolbar = src("src/app/dashboard/cases/cases-toolbar.tsx");
const nav = src("src/app/dashboard/cases/cases-nav.ts");
ok("toolbar accepts a judges prop", /judges: string\[\]/.test(toolbar));
ok("judge is a multi-select facet key", /CASE_MULTI = new Set<string>\(\[[^\]]*"judge"/.test(nav));
ok("judge is in the saved-view keys", /VIEW_KEYS = \[[^\]]*"judge"/.test(nav));
ok("the Filters sheet renders the Judge facet", /multi\("judge", tc\("judge"\), tc\("allJudges"\)/.test(toolbar));

console.log(failed === 0 ? "\nPASS" : `\nFAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
