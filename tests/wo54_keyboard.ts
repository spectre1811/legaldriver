// WO-54 W4b · Keyboard row navigation on the Cases table. Structural guards:
//   (1) rows are focusable (roving tabindex) + have a keydown handler + a labelled aria;
//   (2) the handler is gated on the row being the event target (inner controls aren't hijacked);
//   (3) ArrowUp/Down move focus between rows; Enter opens the detail drawer;
//   (4) a visible focus indicator exists.
//
// Run: npx tsx tests/wo54_keyboard.ts

import { readFileSync } from "node:fs";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed++;
}
const table = readFileSync(new URL("../src/app/dashboard/cases/cases-table.tsx", import.meta.url), "utf8");

ok("row is focusable (tabIndex 0)", /<tr[\s\S]*?tabIndex=\{0\}/.test(table));
ok("row has a keydown handler", /onKeyDown=\{\(e\) => onRowKeyDown\(e, m\)\}/.test(table));
ok("row has a labelled aria", /aria-label=\{t\("row\.aria"/.test(table));
ok("handler is gated on the row being the event target (no hijack of inner controls)", /if \(e\.target !== e\.currentTarget\) return;/.test(table));
ok("ArrowDown moves focus to the next row", /e\.key === "ArrowDown"[\s\S]*?nextElementSibling[\s\S]*?\.focus\(\)/.test(table));
ok("ArrowUp moves focus to the previous row", /e\.key === "ArrowUp"[\s\S]*?previousElementSibling[\s\S]*?\.focus\(\)/.test(table));
ok("Enter opens the detail drawer", /e\.key === "Enter"[\s\S]*?setDrawerRow\(m\)/.test(table));
ok("visible focus indicator on the row", /focus-visible:bg-ec-brass-tint/.test(table));

console.log(failed === 0 ? "\nPASS" : `\nFAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
