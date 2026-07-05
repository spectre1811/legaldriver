// WO-43 Wave 1 — the shared selection primitive extracted from WO-27's inlined Documents UX.
// Offline, no secrets. Run: npx tsx tests/wo43_selection.ts
// Covers the new pure set-algebra directly, and locks the extraction contract by asserting on
// the committed source (the primitive lives in components/, and Documents consumes it — so a
// future edit can't silently re-inline selection into a single surface again).
import { readFileSync } from "node:fs";
import { allSelected, toggleGroup, addRange, rangeIds, toggle } from "../src/lib/select-range";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed++;
}
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ── allSelected ──
ok("allSelected: empty group is never all-selected", allSelected(new Set(["a"]), []) === false);
ok("allSelected: true when every id present", allSelected(new Set(["a", "b", "c"]), ["a", "b"]) === true);
ok("allSelected: false when one missing", allSelected(new Set(["a"]), ["a", "b"]) === false);

// ── toggleGroup ──
{
  // none selected → adds the whole group (leaving unrelated selections intact)
  const g = toggleGroup(new Set(["z"]), ["a", "b"]);
  ok("toggleGroup adds group", g.has("a") && g.has("b") && g.has("z") && g.size === 3);
  // fully selected → clears exactly that group, keeps the rest
  const g2 = toggleGroup(new Set(["a", "b", "z"]), ["a", "b"]);
  ok("toggleGroup clears a full group", !g2.has("a") && !g2.has("b") && g2.has("z") && g2.size === 1);
  // partially selected → completes the group (add-wins)
  const g3 = toggleGroup(new Set(["a"]), ["a", "b"]);
  ok("toggleGroup completes a partial group", g3.has("a") && g3.has("b") && g3.size === 2);
  // immutable
  const base = new Set(["a"]);
  toggleGroup(base, ["a", "b"]);
  ok("toggleGroup is immutable", base.size === 1 && base.has("a"));
}

// ── addRange (shift-click accumulation) ──
{
  const r = addRange(new Set(["a"]), rangeIds(["a", "b", "c", "d"], "b", "d"));
  ok("addRange accumulates a shift-range onto an existing selection", eq([...r].sort(), ["a", "b", "c", "d"]));
  const base = new Set<string>();
  addRange(base, ["x", "y"]);
  ok("addRange is immutable", base.size === 0);
  // sanity: the base primitives are still exported/behaving
  ok("toggle still round-trips", toggle(toggle(new Set<string>(), "a"), "a").size === 0);
}

// ── extraction contract: the primitive is shared, and Documents consumes it (no re-inlining) ──
{
  const idx = src("src/components/selection/index.ts");
  ok("primitive barrel exports useSelection", /export\s*\{[^}]*useSelection/.test(idx));
  ok("primitive barrel exports BulkBar", /export\s*\{[^}]*BulkBar/.test(idx));
  ok("primitive barrel exports UndoToast + useUndo", /UndoToast/.test(idx) && /useUndo/.test(idx));

  const docs = src("src/app/dashboard/documents/documents-browser.tsx");
  ok("Documents imports the shared selection primitive", /@\/components\/selection/.test(docs));
  ok("Documents no longer re-implements its own selection Set", !/useState<Set<string>>/.test(docs));
  ok("Documents uses the shared <BulkBar>", /<BulkBar/.test(docs));
  ok("Documents uses the shared <UndoToast>", /<UndoToast/.test(docs));
}

console.log(failed === 0 ? "\nPASS" : `\nFAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
