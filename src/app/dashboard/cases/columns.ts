// WO-407 E1 · Cases table column picker — pure column-state logic (ids, defaults, visibility,
// reorder, clamp). No React, no i18n, unit-tested offline (tests/wo407_columns.ts), mirroring the
// density.ts / sidebar-width.ts split. The React shell (popover UI) lives in
// components/cases/column-picker.tsx; persistence goes through the shared usePersistedState hook
// (mukadma:cases:columns), same convention as density.

export type ColumnId =
  | "case" | "court" | "next" | "stage" | "advocate" | "caseType" | "filedOn" | "lastSynced";

// "Case" is locked (DESIGN.md E1): always visible, always first, never draggable/removable — kept
// out of the reorderable/persisted set entirely rather than special-cased inside it.
export const LOCKED_COLUMN: ColumnId = "case";

// The 7 columns a user can show/hide/reorder. This order also repairs a corrupted/stale persisted
// value (see parseColumnsState) — any id missing from a stored `order` gets appended in this
// canonical order, so a newly-added column is never silently absent from an existing user's picker.
export const REORDERABLE_COLUMNS: ColumnId[] = [
  "court", "next", "stage", "advocate", "caseType", "filedOn", "lastSynced",
];

// DESIGN.md E1: default ON = Case / Court / Next hearing / Stage; optional = the rest.
export const DEFAULT_VISIBLE: ColumnId[] = ["court", "next", "stage"];

export const COLUMNS_STORAGE_KEY = "mukadma:cases:columns";

export interface ColumnsState {
  /** REORDERABLE_COLUMNS in the user's chosen order (locked "case" is implicit-first, not stored here). */
  order: ColumnId[];
  /** Subset of `order` that's checked (locked "case" is implicitly always visible, not stored here). */
  visible: ColumnId[];
}

export const DEFAULT_COLUMNS_STATE: ColumnsState = { order: REORDERABLE_COLUMNS, visible: DEFAULT_VISIBLE };

function isReorderableId(v: unknown): v is ColumnId {
  return typeof v === "string" && (REORDERABLE_COLUMNS as string[]).includes(v);
}

/**
 * Repair a stored/loaded value into a valid ColumnsState: drops unknown ids (e.g. a removed
 * column), dedupes, and appends any REORDERABLE_COLUMNS missing from `order` at the end (e.g. a
 * newly-added column) — so a column never silently vanishes from the picker after a schema change,
 * and a malformed/corrupt value degrades to the real defaults, never a partial/zero-column table.
 * `usePersistedState` deliberately doesn't validate shape (see use-persisted-state.ts) — every
 * caller reading this key must clamp through here first, the same way cases-table.tsx already does
 * for density via parseDensity.
 */
export function parseColumnsState(v: unknown): ColumnsState {
  const raw = (v ?? {}) as Partial<ColumnsState>;
  const rawOrder = Array.isArray(raw.order) ? raw.order.filter(isReorderableId) : [];
  const order = [...new Set(rawOrder)];
  for (const id of REORDERABLE_COLUMNS) if (!order.includes(id)) order.push(id);

  const rawVisible = Array.isArray(raw.visible) ? raw.visible.filter(isReorderableId) : DEFAULT_VISIBLE;
  const visible = [...new Set(rawVisible)].filter((id) => order.includes(id));

  return { order, visible };
}

/** The real render order: locked column first, then every visible reorderable column, in the
 *  user's order. Never empty — "case" always makes it a minimum of one column (DESIGN.md E1
 *  edge case: unchecking every optional never yields a zero-column table). */
export function visibleColumns(state: ColumnsState): ColumnId[] {
  return [LOCKED_COLUMN, ...state.order.filter((id) => state.visible.includes(id))];
}

export function isColumnVisible(state: ColumnsState, id: ColumnId): boolean {
  return id === LOCKED_COLUMN || state.visible.includes(id);
}

export function toggleColumnVisible(state: ColumnsState, id: ColumnId): ColumnsState {
  if (id === LOCKED_COLUMN) return state; // locked — can't be removed
  const visible = state.visible.includes(id)
    ? state.visible.filter((v) => v !== id)
    : [...state.visible, id];
  return { ...state, visible };
}

/** Move `id` one step up (-1) or down (+1) within `order`; a no-op at either end (keyboard reorder). */
export function moveColumn(state: ColumnsState, id: ColumnId, dir: -1 | 1): ColumnsState {
  const i = state.order.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= state.order.length) return state;
  const order = [...state.order];
  [order[i], order[j]] = [order[j], order[i]];
  return { ...state, order };
}

/** Reposition `id` to sit at `toIndex` within `order` (drag-and-drop reorder, arbitrary distance). */
export function moveColumnToIndex(state: ColumnsState, id: ColumnId, toIndex: number): ColumnsState {
  const rest = state.order.filter((c) => c !== id);
  const clamped = Math.max(0, Math.min(toIndex, rest.length));
  rest.splice(clamped, 0, id);
  return { ...state, order: rest };
}

export function resetColumns(): ColumnsState {
  return DEFAULT_COLUMNS_STATE;
}
