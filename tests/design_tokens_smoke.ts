// Test: design-token single-source integrity (WO-03, Wave 1). No live services.
// Asserts tokens.css defines the "Editorial Chambers" variable set, is wired
// into globals.css, and is exposed through Tailwind's ec-* scale.
// Run: npx tsx tests/design_tokens_smoke.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const tokens = readFileSync(join(root, "src/app/tokens.css"), "utf8");
const tw = readFileSync(join(root, "tailwind.config.ts"), "utf8");
const globals = readFileSync(join(root, "src/app/globals.css"), "utf8");

const requiredVars = [
  "--paper", "--paper-2", "--paper-3", "--ink", "--ink-2", "--ink-3",
  "--brass", "--brass-deep", "--brass-tint", "--indigo", "--indigo-tint",
  "--success", "--warn", "--danger", "--hair", "--hair-strong",
  "--f-display", "--f-ui", "--r-s", "--r-m", "--e1", "--e2",
  "--n900", "--n050",
];

let ok = true;
for (const v of requiredVars) {
  if (!tokens.includes(`${v}:`)) { ok = false; console.log(`tokens.css missing ${v}`); }
}
if (!globals.includes('@import "./tokens.css"')) { ok = false; console.log("globals.css does not import tokens.css"); }
if (!tw.includes("ec:") || !tw.includes("var(--paper)")) { ok = false; console.log("tailwind.config missing ec-* token scale"); }

console.log(ok ? "DESIGN TOKENS: PASS" : "DESIGN TOKENS: FAIL");
process.exit(ok ? 0 : 1);
