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
