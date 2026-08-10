// WO-353 W2 · advisory bundle-size budget check.
// Computes total bytes of .next/static/**/*.js after `next build`,
// compares against web-perf-budget.json, and emits a ::warning:: annotation
// if the total exceeds baseline + warn_pct%. Always exits 0.
//
// Usage: node scripts/check-bundle-size.mjs

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const BUDGET_FILE = "web-perf-budget.json";
const STATIC_DIR = ".next/static";
const DEFAULT_WARN_PCT = 10;

function collectJsBytes(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      total += collectJsBytes(full);
    } else if (entry.name.endsWith(".js")) {
      total += statSync(full).size;
    }
  }
  return total;
}

let budget;
try {
  budget = JSON.parse(readFileSync(BUDGET_FILE, "utf8"));
} catch {
  console.log(
    `::warning title=WO-353 missing budget file::${BUDGET_FILE} not found — run a build to seed it.`
  );
  process.exit(0);
}

if (typeof budget.total_static_js_bytes !== "number" || budget.total_static_js_bytes < 0) {
  console.log(
    `::warning title=WO-353 invalid budget::${BUDGET_FILE} is missing or has an invalid total_static_js_bytes field.`
  );
  process.exit(0);
}

const warnPct = typeof budget.warn_pct === "number" ? budget.warn_pct : DEFAULT_WARN_PCT;
const baseline = budget.total_static_js_bytes;

let measured;
try {
  measured = collectJsBytes(STATIC_DIR);
} catch {
  console.log(
    `::warning title=WO-353 no build output::${STATIC_DIR} not found — run \`npm run build\` before checking bundle size.`
  );
  process.exit(0);
}

const threshold = baseline + Math.ceil((baseline * warnPct) / 100);
const label = (n) => `${(n / 1024).toFixed(1)} KiB (${n.toLocaleString()} bytes)`;

console.log(`Measured .next/static JS: ${label(measured)}`);
console.log(`Baseline:                ${label(baseline)} (warn at +${warnPct}% = ${label(threshold)})`);

if (measured > threshold) {
  const over = measured - threshold;
  console.log(
    `::warning title=WO-353 bundle size over budget::` +
    `Measured: ${label(measured)}, Baseline + ${warnPct}%: ${label(threshold)}, Over by: ${label(over)}. ` +
    `Update ${BUDGET_FILE} to ratchet the baseline.`
  );
} else {
  console.log("Bundle size within budget.");
}

process.exit(0);
