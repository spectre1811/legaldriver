"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { rangeIds, toggle } from "@/lib/select-range";
import { restoreEmails, type BulkResult } from "./actions";

// WO-29 · shared inbox multi-select + bulk + undo, used by BOTH the filed and the review lists
// (product-depth "build once"). Selection over the flat visual `order`; shift-range; Esc clears;
// bulk action → Undo toast that restores each row's exact prior status.
export function useInboxSelection(order: string[]) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<{ entries: { id: string; status: string }[]; label: string } | null>(null);

  const clear = () => { setSelected(new Set()); setAnchor(null); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") clear(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  const allSelected = order.length > 0 && order.every((id) => selected.has(id));
  const toggleAll = () => { allSelected ? clear() : (setSelected(new Set(order)), setAnchor(null)); };

  async function runBulk(fn: (ids: string[]) => Promise<BulkResult>) {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy(true);
    const r = await fn(ids);
    setBusy(false);
    if (r.ok) {
      clear();
      if (r.undo?.length) setUndo({ entries: r.undo, label: r.message });
      router.refresh();
    }
  }

  async function doUndo() {
    if (!undo) return;
    setBusy(true);
    await restoreEmails(undo.entries);
    setBusy(false);
    setUndo(null);
    router.refresh();
  }

  return { selected, onRowToggle, allSelected, toggleAll, clear, busy, undo, dismissUndo: () => setUndo(null), runBulk, doUndo };
}
