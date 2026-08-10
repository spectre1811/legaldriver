"use client";

import { useEffect, useState } from "react";
import { rangeIds, toggle } from "@/lib/select-range";

// WO-29 · inbox multi-select (shift-range, Esc-to-clear) for the bulk archive/delete bar.
// WO-170: trimmed to what the single workspace consumer uses — the old runBulk/undo/toggleAll
// machinery moved into inbox-workspace's shared undo flow, so it lived here as dead code.
export function useInboxSelection(order: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);

  const clear = () => { setSelected(new Set()); setAnchor(null); };
  // WO-335 · the Chambers reference's "select all on this page" checkbox needs to select every
  // visible row in one shot — driving it through repeated onRowToggle calls in the same tick
  // would each read the same stale `selected` closure and clobber each other.
  const selectAll = () => setSelected(new Set(order));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") clear(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Prune ids that left the list after a refresh/tab change, so a later bulk action can't hit a
  // row the user can no longer see (e.g. one that got filed by "Confirm all" and moved tabs).
  const orderKey = order.join(",");
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => order.includes(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [orderKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function onRowToggle(id: string, shift: boolean) {
    if (shift && anchor) {
      const run = rangeIds(order, anchor, id);
      const next = new Set(selected);
      const allOn = run.every((r) => next.has(r));
      run.forEach((r) => (allOn ? next.delete(r) : next.add(r)));
      setSelected(next);
    } else {
      setSelected(toggle(selected, id));
      setAnchor(id);
    }
  }

  return { selected, onRowToggle, clear, selectAll };
}
