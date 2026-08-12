// WO-407 E1 — cases-table column picker. No live services, no DOM/React: exercises the pure
// column-state logic directly (src/app/dashboard/cases/columns.ts) — visibility/order clamp,
// toggle, reorder, the "never a zero-column table" floor — plus source-greps to guard the
// load-bearing wiring (shared persistence hook, the real plusColumns/grip glyphs, the locked
// "Case" column, no native <select>).
// Run: npx tsx tests/wo407_columns.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COLUMNS_STORAGE_KEY, DEFAULT_COLUMNS_STATE, DEFAULT_VISIBLE, LOCKED_COLUMN, REORDERABLE_COLUMNS,
  isColumnVisible, moveColumn, moveColumnToIndex, parseColumnsState, resetColumns,
  toggleColumnVisible, visibleColumns, type ColumnsState,
} from "../src/app/dashboard/cases/columns";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
};

// ── defaults match DESIGN.md E1 ──────────────────────────────────────────────────────────────────
check("locked column is Case", LOCKED_COLUMN === "case");
check(
  "default ON = Case/Court/Next/Stage (locked + DEFAULT_VISIBLE)",
  visibleColumns(DEFAULT_COLUMNS_STATE).join(",") === "case,court,next,stage",
);
check(
  "optional columns = Advocate/Case type/Filed on/Last synced",
  REORDERABLE_COLUMNS.filter((c) => !DEFAULT_VISIBLE.includes(c)).join(",") === "advocate,caseType,filedOn,lastSynced",
);
check("persisted key is mukadma-namespaced", COLUMNS_STORAGE_KEY === "mukadma:cases:columns");

// ── locked column can't be removed ───────────────────────────────────────────────────────────────
check("locked column always reads visible", isColumnVisible(DEFAULT_COLUMNS_STATE, LOCKED_COLUMN));
check("toggling the locked column is a no-op", toggleColumnVisible(DEFAULT_COLUMNS_STATE, LOCKED_COLUMN) === DEFAULT_COLUMNS_STATE);

// ── toggle visibility ─────────────────────────────────────────────────────────────────────────────
const withAdvocate = toggleColumnVisible(DEFAULT_COLUMNS_STATE, "advocate");
check("toggling an optional column on adds it", withAdvocate.visible.includes("advocate"));
check("toggling it again removes it", !toggleColumnVisible(withAdvocate, "advocate").visible.includes("advocate"));

// ── DESIGN.md E1 edge case: unchecking every optional never yields a zero-column table ─────────────
// (Court/Next/Stage start checked too — uncheck ALL non-locked columns, the strictest version of
// the edge case, down to nothing but the locked "Case" column.)
let bare: ColumnsState = DEFAULT_COLUMNS_STATE;
for (const id of DEFAULT_VISIBLE) bare = toggleColumnVisible(bare, id);
check("unchecking every non-locked column still renders ≥1 column (never zero)", visibleColumns(bare).length >= 1);
check("that one remaining column is the locked Case column", visibleColumns(bare).join(",") === "case");
check(
  "unchecking only the optionals (Court/Next/Stage untouched) still renders the 4 defaults",
  visibleColumns(DEFAULT_COLUMNS_STATE).join(",") === "case,court,next,stage",
);

// ── reorder (keyboard alt+arrow: single-step swap) ───────────────────────────────────────────────
const moved = moveColumn(DEFAULT_COLUMNS_STATE, "stage", -1);
check("moveColumn swaps stage up past next", moved.order.slice(0, 3).join(",") === "court,stage,next");
check("moveColumn is a no-op past the start", moveColumn(DEFAULT_COLUMNS_STATE, "court", -1).order.join(",") === DEFAULT_COLUMNS_STATE.order.join(","));
check(
  "moveColumn is a no-op past the end",
  moveColumn(DEFAULT_COLUMNS_STATE, "lastSynced", 1).order.join(",") === DEFAULT_COLUMNS_STATE.order.join(","),
);

// ── reorder (drag-and-drop: arbitrary reposition) ────────────────────────────────────────────────
const dragged = moveColumnToIndex(DEFAULT_COLUMNS_STATE, "lastSynced", 0);
check("moveColumnToIndex repositions to the front", dragged.order[0] === "lastSynced");
check("moveColumnToIndex keeps every column (no drops/dupes)", new Set(dragged.order).size === REORDERABLE_COLUMNS.length);

// ── reset ─────────────────────────────────────────────────────────────────────────────────────────
check("resetColumns returns the real defaults", visibleColumns(resetColumns()).join(",") === "case,court,next,stage");

// ── parseColumnsState clamp/repair (mirrors parseDensity/clampSidebarWidth's defensive contract) ──
check("undefined/null input repairs to the real defaults", visibleColumns(parseColumnsState(undefined)).join(",") === "case,court,next,stage");
check("garbage input repairs to the real defaults", visibleColumns(parseColumnsState("not an object")).join(",") === "case,court,next,stage");
const corrupted = parseColumnsState({ order: ["court", "bogus-column", "court", "stage"], visible: ["stage", "bogus-column", "advocate"] });
check("unknown ids are dropped from order", !corrupted.order.includes("bogus-column" as never));
check("duplicate ids in order are deduped", corrupted.order.filter((c) => c === "court").length === 1);
check("a column missing from a stale order gets appended", REORDERABLE_COLUMNS.every((c) => corrupted.order.includes(c)));
check("visible only contains ids present in order", corrupted.visible.every((c) => corrupted.order.includes(c)));
check("visible drops an id that isn't a real column", !corrupted.visible.includes("bogus-column" as never));
const emptyVisible = parseColumnsState({ order: REORDERABLE_COLUMNS, visible: [] });
check("an explicitly-empty visible list still renders just the locked column, not zero", visibleColumns(emptyVisible).join(",") === "case");

// ── wiring (source-grep, matches the wo406_sidebar.ts convention) ───────────────────────────────
const root = process.cwd();
const table = readFileSync(join(root, "src/app/dashboard/cases/cases-table.tsx"), "utf8");
const picker = readFileSync(join(root, "src/components/cases/column-picker.tsx"), "utf8");
const icons = readFileSync(join(root, "src/components/icons.tsx"), "utf8");
const enMsgs = readFileSync(join(root, "src/i18n/messages/en.json"), "utf8");
const hiMsgs = readFileSync(join(root, "src/i18n/messages/hi.json"), "utf8");

check(
  "cases-table.tsx persists columns via the shared usePersistedState hook, not hand-rolled localStorage",
  table.includes("usePersistedState") && table.includes("COLUMNS_STORAGE_KEY") && !table.includes(".setItem(") && !table.includes(".getItem("),
);
check("cases-table.tsx clamps the loaded value through parseColumnsState (same discipline as parseDensity)", table.includes("parseColumnsState(storedColumns)"));
check("icons.tsx defines the real plusColumns glyph (not a bare plus reused)", icons.includes("plusColumns:"));
check("icons.tsx defines the grip drag-handle glyph", icons.includes("grip:"));
check("the picker trigger uses the plusColumns icon, not the generic plus", picker.includes('"plusColumns"'));
check("the popover uses the shared shadow/z-index/radius tokens (w-[260px], shadow-ec-3, z-ec-dropdown)", /w-\[260px\]/.test(picker) && picker.includes("shadow-ec-3") && picker.includes("z-ec-dropdown"));
check(
  "the locked Case row is checked+disabled, never removable via the UI",
  picker.includes("disabled={locked}") && picker.includes("checked = locked ||") && picker.includes("id === LOCKED_COLUMN"),
);
check("no native <select> for the column list (checkbox rows, per the no-raw-select rule)", !picker.includes("<select"));
check("keyboard reorder is Alt+Arrow, not a bare Arrow (space stays reserved for toggle)", picker.includes("e.altKey") && picker.includes("ArrowUp") && picker.includes("ArrowDown"));

for (const cat of [enMsgs, hiMsgs]) {
  check("i18n catalog carries the cases.columns.* namespace", cat.includes('"columns": {') && cat.includes('"trigger"') && cat.includes('"reset"'));
}

console.log(failures === 0 ? "WO-407 COLUMNS: PASS" : `WO-407 COLUMNS: FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
