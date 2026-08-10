"use client";

// WO-43 Wave 1 — the shared bulk-action bar + selection checkboxes, extracted from the WO-27
// Documents UX. The bar is presentational: it renders the floating bar (count + a divider +
// the caller's action buttons + a clear ✕) and hides itself when nothing is selected. Each list
// passes its own action buttons as children (styled with `bulkBtn`), so the chrome is shared
// but the actions stay list-specific. Copy is passed in (already i18n-resolved) — the primitive
// holds no strings.
//
// WO-331 EXACT-FIDELITY (Cases reskin): retoned from the old dark ink pill to the Chambers
// reference's own bulk bar (design-mockups/iteration3/console/cases.tsx) — a light card with plain
// text buttons, not a rounded-full dark pill. This is a SHARED primitive (also used by Documents) —
// per the "never fork a shared primitive" rule the fix lands here once, so every caller re-tones
// together instead of Cases forking its own copy.

import type { ReactNode } from "react";
import { Icon } from "@/components/icons";

// The action-button class used inside the bar, exported so callers style their buttons to match.
export const bulkBtn = "rounded-ec-s px-2.5 py-1 text-[12.5px] font-medium text-ec-ink-2 hover:bg-ec-paper-3 disabled:opacity-50";

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
  /** Accessible label AND visible text for the clear button. */
  clearLabel: string;
  onClear: () => void;
  /** The list's action buttons/selects. */
  children: ReactNode;
}) {
  if (count <= 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-6 z-40 mx-auto flex w-fit flex-wrap items-center gap-3 rounded-ec-m border border-ec-line-strong bg-ec-card px-4 py-2.5 shadow-ec-2">
      <span className="num font-mono text-[12px] text-ec-ink">{label}</span>
      <span className="h-4 w-px bg-ec-line" />
      {children}
      <button onClick={onClear} className="flex items-center gap-1 text-[12.5px] text-ec-muted-ink hover:text-ec-ink" aria-label={clearLabel}>
        <Icon name="close" className="h-3.5 w-3.5" /> {clearLabel}
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
