"use client";

// WO-43 Wave 1 — the shared undo affordance for reversible bulk actions, extracted from WO-27's
// Documents delete flow. `useUndo` owns the 10s auto-dismiss timer; `<UndoToast>` renders the pill.
// A list calls `show(ids, message)` after a reversible action, then wires the toast's button back
// to its own restore path. Copy is passed in (i18n-resolved) — the primitive holds no strings.

import { useCallback, useRef, useState } from "react";

export interface UndoState {
  ids: string[];
  label: string;
}

export function useUndo(timeoutMs = 10000) {
  const [undo, setUndo] = useState<UndoState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (ids: string[], label: string) => {
      setUndo({ ids, label });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setUndo(null), timeoutMs);
    },
    [timeoutMs],
  );

  const dismiss = useCallback(() => {
    setUndo(null);
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { undo, show, dismiss };
}

export function UndoToast({
  undo,
  actionLabel,
  onUndo,
}: {
  undo: UndoState | null;
  /** The button label, e.g. "Undo". */
  actionLabel: string;
  onUndo: () => void;
}) {
  if (!undo) return null;
  return (
    <div className="fixed inset-x-0 bottom-24 z-50 mx-auto flex w-fit items-center gap-3 rounded-lg bg-ink px-4 py-2.5 text-paper shadow-xl">
      <span className="text-sm">{undo.label}</span>
      <button onClick={onUndo} className="text-sm font-semibold text-brand-200 underline">
        {actionLabel}
      </button>
    </div>
  );
}
