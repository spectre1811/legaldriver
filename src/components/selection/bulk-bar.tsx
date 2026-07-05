"use client";

// WO-43 Wave 1 — the shared bulk-action bar + selection checkboxes, extracted from the WO-27
// Documents UX. The bar is presentational: it renders the floating pill (count + a divider +
// the caller's action buttons + a clear ✕) and hides itself when nothing is selected. Each list
// passes its own action buttons as children (styled with `bulkBtn`), so the chrome is shared
// but the actions stay list-specific. Copy is passed in (already i18n-resolved) — the primitive
// holds no strings.

import type { ReactNode } from "react";

// The action-button class used inside the bar, exported so callers style their buttons to match.
export const bulkBtn =
  "rounded-full px-3 py-1 text-sm font-medium hover:bg-paper/20 disabled:opacity-50";

export function BulkBar({
  count,
  label,
  clearLabel,
  onClear,
  children,
}: {
  /** Number selected; the bar renders only when > 0. */
  count: number;
  /** Already-formatted "N selected" label. */
  label: string;
  /** Accessible label for the clear button. */
  clearLabel: string;
  onClear: () => void;
  /** The list's action buttons/selects. */
  children: ReactNode;
}) {
  if (count <= 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-6 z-40 mx-auto flex w-fit items-center gap-1.5 rounded-full border border-ink/10 bg-ink px-4 py-2.5 text-paper shadow-xl">
      <span className="px-1 text-sm font-semibold">{label}</span>
      <div className="mx-1 h-5 w-px bg-paper/25" />
      {children}
      <button onClick={onClear} className={bulkBtn} aria-label={clearLabel}>
        ✕
      </button>
    </div>
  );
}

// A row checkbox that reports the shift-key state on click (so the parent can do shift-range).
// `onChange` is a no-op — selection is driven from `onClick` because only that event carries shiftKey.
export function RowCheckbox({
  checked,
  onSelect,
  label,
}: {
  checked: boolean;
  onSelect: (shift: boolean) => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onClick={(e) => onSelect(e.shiftKey)}
      onChange={() => {
        /* handled in onClick to read shiftKey */
      }}
      className="h-4 w-4 cursor-pointer accent-brand-600"
      aria-label={label}
    />
  );
}

// The header "select-all-in-group" checkbox.
export function SelectAllCheckbox({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onToggle}
      className="h-4 w-4 cursor-pointer accent-brand-600"
      aria-label={label}
    />
  );
}
