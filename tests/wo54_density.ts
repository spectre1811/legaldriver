// WO-54 W4 · Persisted Cases-list density. Guards:
//   (1) the pure density parser (valid set, safe default, no fabrication);
//   (2) the table renders the density control + reflows via the container [data-density] hook,
//       persists via the shared usePersistedState hook, and the CSS reflow exists.
// WO-331 EXACT-FIDELITY: the reference (cases.tsx) toggles only comfortable/compact — the third
// "cozy" tier was our own addition, dropped to match; default is "comfortable" (the reference's
// own initial state), and Compact no longer hides the subline (the reference only tightens padding).
// WO-405 C4: persistence moved off a cookie onto localStorage (see tests/wo405_persisted_state.ts
// for the hook's own read/write + adoption coverage) — the server page no longer seeds density
// from a cookie for first paint (§2 below dropped); it hydrates client-side after mount instead.
//
// Run: npx tsx tests/wo54_density.ts

import { readFileSync } from "node:fs";
import { parseDensity, isDensity, DEFAULT_DENSITY, DENSITIES } from "../src/app/dashboard/cases/density";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed++;
}
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// ── 1. pure parser ───────────────────────────────────────────────────────────
ok("two density tiers", DENSITIES.length === 2 && DENSITIES.includes("comfortable") && DENSITIES.includes("compact"));
ok("default is comfortable", DEFAULT_DENSITY === "comfortable");
ok("parseDensity accepts a valid value", parseDensity("compact") === "compact");
ok("parseDensity falls back to default on junk", parseDensity("huge") === "comfortable");
ok("parseDensity falls back on undefined (nothing persisted yet)", parseDensity(undefined) === "comfortable");
ok("parseDensity falls back on the retired 'cozy' value", parseDensity("cozy") === "comfortable");
ok("isDensity rejects a non-member", !isDensity("spacious") && isDensity("comfortable"));

// ── 2. server page no longer owns density (WO-405 C4: cookie retired) ────────
const page = src("src/app/dashboard/cases/page.tsx");
ok("page no longer reads a density cookie server-side (retired, WO-405 C4)", !/DENSITY_COOKIE/.test(page) && !/cookies\(\)\.get/.test(page));

// ── 3. table: control + reflow + persist via the shared hook ─────────────────
const table = src("src/app/dashboard/cases/cases-table.tsx");
ok("table accepts initialDensity", /initialDensity\?: Density/.test(table));
ok("table renders the density control (all three)", /DENSITIES\.map/.test(table) && /aria-pressed=\{density === d\}/.test(table));
ok("table applies data-density on the container", /className="cases-table[^"]*" data-density=\{density\}/.test(table));
ok("density persists via the shared usePersistedState hook (WO-405 C4), not a hand-rolled cookie", /usePersistedState<Density>\(DENSITY_STORAGE_KEY,\s*initialDensity\)/.test(table) && !/document\.cookie/.test(table));
ok("subline tagged for the Compact single-line reflow", /cases-subline/.test(table));

// ── 4. CSS reflow exists (container-scoped) ──────────────────────────────────
const css = src("src/app/globals.css");
ok("CSS reflows td padding per density", /\.cases-table\[data-density="comfortable"\] tbody td/.test(css) && /\.cases-table\[data-density="compact"\] tbody td/.test(css));
ok("no stale 'cozy' density rule left behind", !/data-density="cozy"/.test(css));

console.log(failed === 0 ? "\nPASS" : `\nFAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
