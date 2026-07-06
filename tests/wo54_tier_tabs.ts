// WO-54 W2 · Court-tier tab strip. Guards:
//   (1) the list query scopes by tier on the indexed column;
//   (2) fetchTierCounts exists (live HEAD counts);
//   (3) the tab strip scopes via ?tier=, preserves other params, and only shows Tribunal/SC when
//       present; the page renders it above the saved-view tabs.
//
// Run: npx tsx tests/wo54_tier_tabs.ts

import { readFileSync } from "node:fs";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed++;
}
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// ── query ────────────────────────────────────────────────────────────────────
const query = src("src/app/dashboard/cases/cases-query.ts");
ok("CasesFilters has a tier field", /interface CasesFilters[\s\S]*?tier\?: string/.test(query));
ok("buildCasesQuery scopes by tier (indexed column)", /if \(f\.tier\) query = query\.eq\("tier", f\.tier\)/.test(query));
ok("fetchTierCounts exists", /export async function fetchTierCounts/.test(query));
ok("tier counts are HEAD counts (bounded, not a scan)", /head\(\)\.eq\("tier", "HC"\)/.test(query) && /count: "exact", head: true/.test(query));

// ── tab strip ─────────────────────────────────────────────────────────────────
const tabs = src("src/app/dashboard/cases/cases-tier-tabs.tsx");
ok("tier tab sets ?tier=", /next\.set\("tier", tier\)/.test(tabs));
ok("'All' clears the tier scope", /next\.delete\("tier"\)/.test(tabs));
ok("selecting a tier resets pagination", /next\.delete\("page"\)/.test(tabs));
ok("selecting a tier preserves the other params", /new URLSearchParams\(sp\.toString\(\)\)/.test(tabs));
ok("HC + District always show; Tribunal/SC only when present", /alwaysShow: true[\s\S]*?HC[\s\S]*?alwaysShow: true[\s\S]*?DISTRICT/.test(tabs) && /alwaysShow: false/.test(tabs) && /tab\.alwaysShow \|\| tab\.count > 0/.test(tabs));
ok("tabs are ARIA tablist/tab with selected state", /role="tablist"/.test(tabs) && /role="tab"/.test(tabs) && /aria-selected=\{isActive\}/.test(tabs));

// ── page wiring ────────────────────────────────────────────────────────────────
const page = src("src/app/dashboard/cases/page.tsx");
ok("page fetches tier counts", /fetchTierCounts\(supabase\)/.test(page));
ok("page renders the tier tab strip", /<CasesTierTabs counts=\{tierCounts\}/.test(page));
ok("tier flows into the filters", /const filters: CasesFilters = \{ q, tier,/.test(page));

console.log(failed === 0 ? "\nPASS" : `\nFAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
