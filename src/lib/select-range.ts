// Pure multi-select range logic (WO-27 Wave 2) — shift-click selects the contiguous run between the
// last-clicked "anchor" and the target, over the flat visual order. No React, so it's unit-tested.

export function rangeIds(orderedIds: string[], anchorId: string, targetId: string): string[] {
  const a = orderedIds.indexOf(anchorId);
  const b = orderedIds.indexOf(targetId);
  if (a === -1 || b === -1) return [targetId];
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return orderedIds.slice(lo, hi + 1);
}

// Toggle one id in a selection set (immutable) — the plain click behaviour.
export function toggle(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}

// Are every id in `ids` currently selected? (empty group → false, so a "select-all" box starts unchecked).
export function allSelected(selected: ReadonlySet<string>, ids: readonly string[]): boolean {
  return ids.length > 0 && ids.every((id) => selected.has(id));
}

// The header "select-all" behaviour for a group (immutable): if the whole group is already
// selected, deselect it; otherwise add the whole group (leaving other selections untouched).
export function toggleGroup(selected: ReadonlySet<string>, ids: readonly string[]): Set<string> {
  const next = new Set(selected);
  if (allSelected(selected, ids)) ids.forEach((id) => next.delete(id));
  else ids.forEach((id) => next.add(id));
  return next;
}

// Add a run of ids to a selection (immutable) — the shift-click range accumulation.
export function addRange(selected: ReadonlySet<string>, ids: readonly string[]): Set<string> {
  const next = new Set(selected);
  ids.forEach((id) => next.add(id));
  return next;
}
