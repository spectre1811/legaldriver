"use client";

// WO-407 E1 — the cases-table column picker: a `+` chip that opens a checkbox + drag-to-reorder
// popover (DESIGN.md E1). Controlled: the parent (cases-table.tsx) owns the persisted ColumnsState
// (via usePersistedState, mukadma:cases:columns) and passes it in + an onChange — this component
// only owns its own open/closed + in-flight-drag UI state, same split as BulkBar/UndoToast. Column
// labels are passed in pre-resolved (`labels`) rather than this component calling useTranslations
// itself for them, so it can reuse cases.console.*'s existing Stage/Advocate/Case-type strings
// without a duplicate translation key (only the popover's own chrome strings are new, cases.columns.*).

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import {
  LOCKED_COLUMN, REORDERABLE_COLUMNS, moveColumn, moveColumnToIndex, resetColumns,
  toggleColumnVisible, type ColumnId, type ColumnsState,
} from "@/app/dashboard/cases/columns";

type DropPos = { id: ColumnId; edge: "before" | "after" } | null;

export function ColumnPicker({
  columns,
  onChange,
  labels,
}: {
  columns: ColumnsState;
  onChange: (next: ColumnsState) => void;
  /** Pre-resolved display label per column id (incl. the locked "case" row). */
  labels: Record<ColumnId, string>;
}) {
  const t = useTranslations("cases.columns");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Partial<Record<ColumnId, HTMLInputElement | null>>>({});
  const [focusAfter, setFocusAfter] = useState<ColumnId | null>(null);
  const [draggingId, setDraggingId] = useState<ColumnId | null>(null);
  const [dropAt, setDropAt] = useState<DropPos>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  // Refocus the row a keyboard reorder just moved, after the parent's state update re-renders it.
  useEffect(() => {
    if (!focusAfter) return;
    rowRefs.current[focusAfter]?.focus();
    setFocusAfter(null);
  }, [focusAfter, columns]);

  function onRowKeyDown(e: React.KeyboardEvent<HTMLInputElement>, id: ColumnId) {
    const idx = REORDERABLE_COLUMNS.indexOf(id);
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      onChange(moveColumn(columns, id, e.key === "ArrowUp" ? -1 : 1));
      setFocusAfter(id);
      return;
    }
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const dir = e.key === "ArrowUp" ? -1 : 1;
      const targetId = idx >= 0 ? REORDERABLE_COLUMNS[idx + dir] : undefined;
      if (targetId) rowRefs.current[targetId]?.focus();
    }
  }

  function onDrop(overId: ColumnId, edge: "before" | "after") {
    if (!draggingId || draggingId === overId) return;
    const rest = columns.order.filter((c) => c !== draggingId);
    const overIdx = rest.indexOf(overId);
    onChange(moveColumnToIndex(columns, draggingId, overIdx + (edge === "after" ? 1 : 0)));
  }

  function endDrag() {
    setDraggingId(null);
    setDropAt(null);
  }

  const rows: ColumnId[] = [LOCKED_COLUMN, ...columns.order];

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("trigger")}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-7 w-7 items-center justify-center rounded-ec-s border border-ec-line bg-ec-card text-ec-muted-ink transition-colors hover:text-ec-bronze"
      >
        <Icon name="plusColumns" className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t("heading")}
          className="absolute right-0 top-full z-ec-dropdown mt-1.5 w-[260px] rounded-ec-m border border-ec-line bg-ec-card p-1.5 shadow-ec-3"
        >
          <div className="eyebrow px-2 pt-1.5 pb-1">{t("heading")}</div>
          <p className="sr-only" id="cases-columns-hint">{t("reorderHint")}</p>
          <ul aria-describedby="cases-columns-hint">
            {rows.map((id) => {
              const locked = id === LOCKED_COLUMN;
              const checked = locked || columns.visible.includes(id);
              const dragOver = dropAt?.id === id;
              return (
                <li
                  key={id}
                  draggable={!locked}
                  onDragStart={() => setDraggingId(id)}
                  onDragOver={(e) => {
                    if (locked || !draggingId) return;
                    e.preventDefault();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const edge = e.clientY - rect.top < rect.height / 2 ? "before" : "after";
                    setDropAt({ id, edge });
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!locked && dropAt) onDrop(id, dropAt.edge);
                    endDrag();
                  }}
                  onDragEnd={endDrag}
                  className={`relative flex items-center gap-2 rounded-ec-s px-2 py-1.5 hover:bg-ec-band ${
                    draggingId === id ? "bg-ec-bronze-tint shadow-ec-2" : ""
                  }`}
                >
                  {dragOver && dropAt?.edge === "before" && (
                    <span className="pointer-events-none absolute inset-x-2 top-0 h-[2px] bg-ec-bronze" />
                  )}
                  <Icon
                    name="grip"
                    aria-hidden="true"
                    className={`h-3.5 w-3.5 shrink-0 text-ec-hair-strong ${locked ? "opacity-30" : "cursor-grab"}`}
                  />
                  <label className="flex min-w-0 flex-1 items-center gap-2 text-[13px] text-ec-ink">
                    <input
                      ref={(el) => { rowRefs.current[id] = el; }}
                      type="checkbox"
                      checked={checked}
                      disabled={locked}
                      onChange={() => !locked && onChange(toggleColumnVisible(columns, id))}
                      onKeyDown={(e) => !locked && onRowKeyDown(e, id)}
                      aria-label={labels[id]}
                      className="h-3.5 w-3.5 accent-ec-bronze disabled:opacity-60"
                    />
                    <span className="truncate">{labels[id]}</span>
                  </label>
                  {dragOver && dropAt?.edge === "after" && (
                    <span className="pointer-events-none absolute inset-x-2 bottom-0 h-[2px] bg-ec-bronze" />
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-1 border-t border-ec-line pt-1.5">
            <button
              type="button"
              onClick={() => onChange(resetColumns())}
              className="px-2 text-[12px] text-ec-muted-ink transition-colors hover:text-ec-bronze"
            >
              {t("reset")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
