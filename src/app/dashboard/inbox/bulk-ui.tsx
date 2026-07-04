"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";

// Shared bulk action bar + undo toast for the inbox lists (WO-29).
export function BulkBar({ count, busy, onArchive, onDelete, onClear }: {
  count: number; busy: boolean; onArchive: () => void; onDelete: () => void; onClear: () => void;
}) {
  const t = useTranslations("inbox");
  if (count === 0) return null;
  return (
    <div className="sticky bottom-4 z-20 mx-auto flex w-fit items-center gap-2 rounded-xl border border-line bg-ink px-4 py-2.5 text-sm text-white shadow-lg">
      <span className="font-medium">{t("bulk.nSelected", { n: count })}</span>
      <button disabled={busy} onClick={onArchive} className="rounded-lg px-2.5 py-1 hover:bg-white/10 disabled:opacity-50">{t("bulk.archive")}</button>
      <button disabled={busy} onClick={onDelete} className="rounded-lg px-2.5 py-1 text-red-300 hover:bg-white/10 disabled:opacity-50">{t("bulk.delete")}</button>
      <button onClick={onClear} className="rounded-lg px-2.5 py-1 text-white/70 hover:bg-white/10">{t("bulk.cancel")}</button>
    </div>
  );
}

export function UndoToast({ label, busy, onUndo, onDismiss }: {
  label: string; busy: boolean; onUndo: () => void; onDismiss: () => void;
}) {
  const t = useTranslations("inbox");
  return (
    <div className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-line bg-white px-4 py-2.5 text-sm shadow-lg">
      <span className="text-ink">{label}</span>
      <button disabled={busy} onClick={onUndo} className="font-medium text-brand-600 hover:underline disabled:opacity-50">{t("bulk.undo")}</button>
      <button onClick={onDismiss} className="text-ink-faint hover:text-ink"><Icon name="close" className="h-3.5 w-3.5" /></button>
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
      className="mt-1 h-4 w-4 shrink-0 rounded border-line"
    />
  );
}
