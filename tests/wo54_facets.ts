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

// ── Judge facet (console) ────────────────────────────────────────────────────
const console_ = src("src/app/dashboard/cases/console.tsx");
ok("console accepts a judges prop", /judges: string\[\]/.test(console_));
ok("judge is a multi-select facet key", /const MULTI = new Set<string>\(\[[^\]]*"judge"/.test(console_));
ok("judge is in the saved-view KEYS", /const KEYS = \[[^\]]*"judge"/.test(console_));
ok("console renders the Judge dropdown", /multi\("judge", t\("judge"\), t\("allJudges"\)/.test(console_));

console.log(failed === 0 ? "\nPASS" : `\nFAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
