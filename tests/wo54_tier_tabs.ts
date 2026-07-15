// WO-54 W2 · Court-tier filter (WO-147 W2 moved it from a pill strip into a toolbar segmented). Guards:
//   (1) the list query scopes by tier on the indexed column;
//   (2) fetchTierCounts exists (live HEAD counts);
//   (3) the court segmented scopes via ?tier= through the shared soft-nav (resets page, preserves
//       other params, clears on "All"), only shows Tribunal/SC when present, and the page wires it.
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

// ── shared URL mechanism (WO-147 W2: replaced per-toggle router.push) ───────────
const nav = src("src/app/dashboard/cases/cases-nav.ts");
ok("setParam clears a param when empty ('All' clears the tier scope)", /if \(value\) next\.set\(key, value\);[\s\S]*?else next\.delete\(key\)/.test(nav));
ok("a filter change resets pagination", /next\.delete\("page"\)/.test(nav));
ok("a filter change preserves the other params", /new URLSearchParams\(sp\.toString\(\)\)/.test(nav));
ok("the list mutates the URL via router.replace soft-nav (no history stacking)", /router\.replace\(/.test(nav) && /scroll: false/.test(nav) && !/router\.push\(/.test(nav));

// ── court-tier segmented control (WO-147 W2: replaced the pill strip) ───────────
const toolbar = src("src/app/dashboard/cases/cases-toolbar.tsx");
ok("court tier is a segmented control that sets ?tier=", /onChange=\{\(v\) => setParam\("tier", v\)\}/.test(toolbar));
ok("HC + District always show; Tribunal/SC only when present", /value: "HC"[\s\S]*?value: "DISTRICT"/.test(toolbar) && /tierCounts\.TRIBUNAL > 0 \?/.test(toolbar) && /tierCounts\.SC > 0 \?/.test(toolbar));

const seg = src("src/app/dashboard/cases/segmented.tsx");
ok("segmented is an ARIA group with pressed state", /role="group"/.test(seg) && /aria-pressed=\{active\}/.test(seg));

// ── page wiring ────────────────────────────────────────────────────────────────
const page = src("src/app/dashboard/cases/page.tsx");
ok("page fetches tier counts", /fetchTierCounts\(supabase\)/.test(page));
ok("page passes tier counts to the toolbar", /<CasesToolbar[\s\S]*?tierCounts=\{tierCounts\}/.test(page));
ok("tier flows into the filters", /const filters: CasesFilters = \{ q, tier,/.test(page));

console.log(failed === 0 ? "\nPASS" : `\nFAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
