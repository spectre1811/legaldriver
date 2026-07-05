"use client";

// WO-43 Wave 1 — the shared multi-select hook, extracted verbatim from the WO-27 selection UX
// that had been inlined in `documents/documents-browser.tsx`. It owns the selection Set + the
// shift-click anchor and exposes exactly the callbacks a selectable list needs, so every list
// (Cases, Clients, Notices, …) gets the same behaviour without re-implementing it. The pure
// set-algebra lives in `@/lib/select-range` (unit-tested there); this is just the React shell.

import { useCallback, useEffect, useState } from "react";
import {
  rangeIds,
  toggle,
  addRange,
  toggleGroup as toggleGroupPure,
  allSelected as allSelectedPure,
} from "@/lib/select-range";

export interface UseSelection {
  /** The selected ids. */
  selected: Set<string>;
  /** `selected.size`, for convenience. */
  size: number;
  /** Is this id selected? */
  isSelected: (id: string) => boolean;
  /** Row click: plain-click toggles one (and moves the anchor); shift-click extends the range
   *  from the anchor over `orderedIds`. Wire this to the row checkbox's `onClick` (reads shiftKey). */
  onRowClick: (id: string, shift: boolean) => void;
  /** Header "select-all-in-group": select the whole group, or clear it if already fully selected. */
  toggleGroup: (ids: readonly string[]) => void;
  /** Is every id in this group selected? (drives the group checkbox's `checked`). */
  allSelected: (ids: readonly string[]) => boolean;
  /** Clear the selection + anchor. */
  clear: () => void;
}

export interface UseSelectionOptions {
  /** Wire a window Escape listener that clears the selection (default true). A list that already
   *  owns Escape (e.g. Documents closes its preview first) passes `false` and calls `clear()` itself. */
  escClears?: boolean;
}

// `orderedIds` is the flat visual order of every selectable row — the basis for shift-range.
export function useSelection(orderedIds: string[], opts: UseSelectionOptions = {}): UseSelection {
  const escClears = opts.escClears ?? true;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);

  const clear = useCallback(() => {
    setSelected(new Set());
    setAnchor(null);
  }, []);

  const onRowClick = useCallback(
    (id: string, shift: boolean) => {
      if (shift && anchor) {
        const ids = rangeIds(orderedIds, anchor, id);
        setSelected((prev) => addRange(prev, ids));
      } else {
        setSelected((prev) => toggle(prev, id));
        setAnchor(id);
      }
    },
    [anchor, orderedIds],
  );

  const toggleGroup = useCallback((ids: readonly string[]) => {
    setSelected((prev) => toggleGroupPure(prev, ids));
  }, []);

  const allSelected = useCallback(
    (ids: readonly string[]) => allSelectedPure(selected, ids),
    [selected],
  );

  useEffect(() => {
    if (!escClears) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clear();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [escClears, clear]);

  return {
    selected,
    size: selected.size,
    isSelected: useCallback((id: string) => selected.has(id), [selected]),
    onRowClick,
    toggleGroup,
    allSelected,
    clear,
  };
}
