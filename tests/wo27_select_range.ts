// WO-27 Wave 2 — multi-select range logic. Run: npx tsx tests/wo27_select_range.ts
import { rangeIds, toggle } from "../src/lib/select-range";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed++;
}

const ids = ["a", "b", "c", "d", "e"];

// range is inclusive + direction-agnostic
ok("forward range b→d", JSON.stringify(rangeIds(ids, "b", "d")) === JSON.stringify(["b", "c", "d"]));
ok("backward range d→b (same set)", JSON.stringify(rangeIds(ids, "d", "b")) === JSON.stringify(["b", "c", "d"]));
ok("single-element range", JSON.stringify(rangeIds(ids, "c", "c")) === JSON.stringify(["c"]));
ok("unknown anchor falls back to target only", JSON.stringify(rangeIds(ids, "z", "c")) === JSON.stringify(["c"]));

// toggle add + remove, immutable
const s1 = toggle(new Set<string>(), "a");
ok("toggle adds", s1.has("a") && s1.size === 1);
const s2 = toggle(s1, "a");
ok("toggle removes", !s2.has("a") && s2.size === 0);
ok("toggle is immutable", s1.has("a"));

console.log(failed === 0 ? "\nPASS" : `\nFAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
