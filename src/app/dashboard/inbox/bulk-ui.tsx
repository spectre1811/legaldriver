"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";

// Shared bulk action row + undo toast for the inbox lists (WO-29). WO-335: restyled to the
// Chambers reference's inline selected-row (was a floating sticky-bottom pill) — same node order
// as the reference (selected count → File all → Ignore → Mark reviewed → Clear). The reference's
// own "File all" and "Mark reviewed" are rendered honestly-disabled: bulk filing to each email's
// own suggestion, and a reviewed state, are both real extensions of the file-to-case flow (the
// latter has no schema backing at all — status is only needs_review/filed/archived/deleted) — out
// of this restyle-only WO's scope, flagged in the PR + queue/INBOX.md, not fabricated. "Delete" is
// real pre-existing WO-29 functionality with no reference counterpart, kept and appended after the
// reference's own nodes rather than dropped.
export function BulkBar({ count, busy, onArchive, onDelete, onClear }: {
  count: number; busy: boolean; onArchive: () => void; onDelete: () => void; onClear: () => void;
}) {
  const t = useTranslations("inbox");
  const td = useTranslations("dashboard.inbox");
  if (count === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-ec-line-strong bg-ec-paper-3 px-3 py-2">
      <span className="num font-mono text-[11.5px] text-ec-ink">{t("bulk.nSelected", { n: count })}</span>
      <button
        type="button"
        disabled
        title={td("bulk.fileAllPending")}
        aria-disabled="true"
        className="text-[12.5px] font-medium text-ec-muted-ink opacity-60"
      >
        {td("bulk.fileAll")}
      </button>
      <button disabled={busy} onClick={onArchive} className="text-[12.5px] text-ec-ink-2 hover:text-ec-bronze disabled:opacity-50">
        {td("bulk.ignore")}
      </button>
      <button
        type="button"
        disabled
        title={td("bulk.markReviewedPending")}
        aria-disabled="true"
        className="text-[12.5px] text-ec-muted-ink opacity-60"
      >
        {td("bulk.markReviewed")}
      </button>
      <button disabled={busy} onClick={onDelete} className="text-[12.5px] text-ec-danger hover:underline disabled:opacity-50">
        {t("bulk.delete")}
      </button>
      <button onClick={onClear} className="ml-auto inline-flex items-center gap-1 text-[12.5px] text-ec-muted-ink hover:text-ec-ink-2">
        <Icon name="close" className="h-3.5 w-3.5" /> {t("bulk.cancel")}
      </button>
    </div>
  );
}

export function UndoToast({ label, busy, onUndo, onDismiss }: {
  label: string; busy: boolean; onUndo: () => void; onDismiss: () => void;
}) {
  const t = useTranslations("inbox");
  return (
    <div className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-md bg-ec-ink px-4 py-2.5 text-[12.5px] text-ec-paper shadow-ec-2">
      <span>{label}</span>
      <button disabled={busy} onClick={onUndo} className="font-medium text-ec-honey hover:underline disabled:opacity-50">{t("bulk.undo")}</button>
      <button onClick={onDismiss} aria-label={t("bulk.cancel")} className="text-ec-paper/60 hover:text-ec-paper"><Icon name="close" className="h-3.5 w-3.5" /></button>
    </div>
  );
}

// A selection checkbox with shift-range support (controlled via onClick to read shiftKey).
export function SelectBox({ checked, onToggle }: { checked: boolean; onToggle: (shift: boolean) => void }) {
  const t = useTranslations("inbox");
  return (
    <input
      type="checkbox"
      checked={checked}
      readOnly
      aria-label={t("bulk.selectOne")}
      onClick={(ev) => onToggle(ev.shiftKey)}
      className="mt-1 h-3.5 w-3.5 shrink-0 accent-ec-bronze"
    />
  );
}
