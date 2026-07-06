// WO-54 W4 · Persisted Cases-list density. Guards:
//   (1) the pure density parser (valid set, safe default, no fabrication);
//   (2) the server page seeds density from the cookie (no hydration flash);
//   (3) the table renders the density control + reflows via the container [data-density] hook,
//       persists to the cookie, and the CSS reflow + Compact subline-hide exist.
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
ok("three density tiers", DENSITIES.length === 3 && DENSITIES.includes("comfortable") && DENSITIES.includes("cozy") && DENSITIES.includes("compact"));
ok("default is cozy", DEFAULT_DENSITY === "cozy");
ok("parseDensity accepts a valid value", parseDensity("compact") === "compact");
ok("parseDensity falls back to default on junk", parseDensity("huge") === "cozy");
ok("parseDensity falls back on undefined (no cookie yet)", parseDensity(undefined) === "cozy");
ok("isDensity rejects a non-member", !isDensity("spacious") && isDensity("cozy"));

// ── 2. server page seeds from the cookie ─────────────────────────────────────
const page = src("src/app/dashboard/cases/page.tsx");
ok("page reads the density cookie server-side", /cookies\(\)\.get\(DENSITY_COOKIE\)/.test(page) && /parseDensity/.test(page));
ok("page passes initialDensity to the table", /initialDensity=\{density\}/.test(page));

// ── 3. table: control + reflow + persist ─────────────────────────────────────
const table = src("src/app/dashboard/cases/cases-table.tsx");
ok("table accepts initialDensity", /initialDensity\?: Density/.test(table));
ok("table renders the density control (all three)", /DENSITIES\.map/.test(table) && /aria-pressed=\{density === d\}/.test(table));
ok("table applies data-density on the container", /className="cases-table[^"]*" data-density=\{density\}/.test(table));
ok("changing density persists to the cookie", /document\.cookie = `\$\{DENSITY_COOKIE\}=/.test(table));
ok("subline tagged for the Compact single-line reflow", /cases-subline/.test(table));

// ── 4. CSS reflow exists (container-scoped) ──────────────────────────────────
const css = src("src/app/globals.css");
ok("CSS reflows td padding per density", /\.cases-table\[data-density="comfortable"\] tbody td/.test(css) && /\.cases-table\[data-density="compact"\] tbody td/.test(css));
ok("Compact hides the subline (single-line scan)", /\.cases-table\[data-density="compact"\] \.cases-subline\s*\{\s*display: none/.test(css));

console.log(failed === 0 ? "\nPASS" : `\nFAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
