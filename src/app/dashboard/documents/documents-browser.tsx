"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/icons";
import { DocActions } from "@/components/doc-actions";
import { DocPreview } from "@/components/doc-preview";
import {
  useSelection, useUndo, BulkBar, bulkBtn, RowCheckbox, SelectAllCheckbox, UndoToast,
} from "@/components/selection";
import {
  bulkDeleteDocuments, restoreDocuments, purgeDocuments, bulkFileToClient, bulkFileToCase,
} from "./actions";

export type DocRow = {
  id: string; filename: string; docType: string | null; mime: string | null;
  primary: string | null; secondary: string | null;
  sourceLabel: string; sizeLabel: string; dateLabel: string;
  matterId: string | null; clientId: string | null; shared: boolean;
  hasFile: boolean;
};
export type DocSection = { cat: string; label: string; icon: string; rows: DocRow[] };
type Opt = { id: string; label: string };

// WO-27 Wave 2 — the selectable document list. Checkboxes are ALWAYS visible (not hover-only), a
// prominent bulk bar appears on selection, delete is reversible (soft-delete + 10s Undo toast), and
// Trash mode swaps the actions to Restore / Delete-forever. Shift-click selects a range; Esc clears.
export function DocumentsBrowser({ sections, orderedIds, matterOpts, clientOpts, trash }: {
  sections: DocSection[]; orderedIds: string[]; matterOpts: Opt[]; clientOpts: Opt[]; trash: boolean;
}) {
  const t = useTranslations("documents");
  const router = useRouter();
  // Shared selection primitive (WO-43). `escClears: false` because this list owns Escape itself:
  // it closes the quick-look preview first, and only then clears the selection.
  const sel = useSelection(orderedIds, { escClears: false });
  const { undo, show: showUndo, dismiss: dismissUndo } = useUndo();
  const [busy, setBusy] = useState(false);
  const [exportErr, setExportErr] = useState(false);
  const [preview, setPreview] = useState<DocRow | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // When the quick-look opens, move focus into the dialog (a11y) and restore it to the trigger on close.
  useEffect(() => {
    if (!preview) return;
    const prev = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();
    return () => prev?.focus?.();
  }, [preview]);

  const clear = sel.clear;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (preview) setPreview(null); // close the quick-look first…
      else clear();                  // …otherwise drop the selection
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clear, preview]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try { await fn(); router.refresh(); } finally { setBusy(false); }
  }
  async function onDelete() {
    const ids = [...sel.selected];
    await run(async () => { const r = await bulkDeleteDocuments(ids); showUndo(ids, r.message); });
    clear();
  }
  async function onUndo() {
    if (!undo) return;
    const ids = undo.ids; dismissUndo();
    await run(() => restoreDocuments(ids));
  }
  async function onRestore() { const ids = [...sel.selected]; await run(() => restoreDocuments(ids)); clear(); }
  async function onPurge() {
    if (!window.confirm(t("bulk.purgeConfirm", { n: sel.size }))) return;
    const ids = [...sel.selected]; await run(() => purgeDocuments(ids)); clear();
  }
  // Export the selection as ONE zip (files + an index.csv register) via the export route, instead
  // of opening a signed URL per file in a new tab (which browsers block past the first).
  async function onExport() {
    setExportErr(false);
    setBusy(true);
    try {
      const res = await fetch("/api/documents/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...sel.selected] }),
      });
      if (!res.ok) { setExportErr(true); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "documents-export.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportErr(true);
    } finally {
      setBusy(false);
    }
  }
  async function onFileClient(clientId: string) {
    if (!clientId) return;
    const ids = [...sel.selected]; await run(() => bulkFileToClient(ids, clientId)); clear();
  }
  async function onFileCase(matterId: string) {
    if (!matterId) return;
    const ids = [...sel.selected]; await run(() => bulkFileToCase(ids, matterId)); clear();
  }

  const btn = bulkBtn;

  return (
    <>
      <div className="space-y-6 pb-16">
        {sections.map((s) => {
          const sectionIds = s.rows.map((r) => r.id);
          const allInSection = sel.allSelected(sectionIds);
          return (
            <div key={s.cat} className="ec-card overflow-hidden">
              {/* Sand section band — the group divider (category / client / case). */}
              <div className="flex items-center gap-2.5 border-b border-ec-hair bg-ec-paper-3 px-5 py-3">
                <Icon name={(s.icon as IconName) ?? "documents"} className="h-4 w-4 text-ec-bronze" />
                <h2 className="ec-label !tracking-normal text-[13px] normal-case text-ec-ink">{s.label}</h2>
                <span className="num text-xs text-ec-ink-3">{s.rows.length}</span>
              </div>
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ec-hair text-left">
                    <th className="w-10 px-4 py-3">
                      <SelectAllCheckbox
                        checked={allInSection}
                        onToggle={() => sel.toggleGroup(sectionIds)}
                        label={t("bulk.selectAll")}
                      />
                    </th>
                    <th className="px-3 py-3"><span className="ec-label">{t("field.file")}</span></th>
                    <th className="hidden px-4 py-3 sm:table-cell"><span className="ec-label">{t("field.type")}</span></th>
                    <th className="px-4 py-3"><span className="ec-label">{t("field.filedUnder")}</span></th>
                    <th className="hidden px-4 py-3 md:table-cell"><span className="ec-label">{t("field.source")}</span></th>
                    <th className="hidden px-4 py-3 lg:table-cell"><span className="ec-label">{t("field.size")}</span></th>
                    <th className="hidden px-4 py-3 lg:table-cell"><span className="ec-label">{t("field.added")}</span></th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {s.rows.map((d) => {
                    const checked = sel.isSelected(d.id);
                    return (
                      <tr key={d.id} className={`border-b border-ec-hair last:border-0 ${checked ? "bg-ec-brass-tint/40" : "ec-row"}`}>
                        <td className="px-4 py-3.5">
                          <RowCheckbox
                            checked={checked}
                            onSelect={(shift) => sel.onRowClick(d.id, shift)}
                            label={`Select ${d.filename}`}
                          />
                        </td>
                        <td className="px-3 py-3.5">
                          <Link href={`/dashboard/documents/${d.id}`} className="group flex items-center gap-2.5">
                            <Icon name="documents" className="h-4 w-4 shrink-0 text-ec-ink-3" />
                            <span className="font-medium text-ec-ink group-hover:text-ec-bronze group-hover:underline">{d.filename}</span>
                          </Link>
                        </td>
                        <td className="hidden px-4 py-3.5 sm:table-cell">{d.docType ? <span className="ec-chip">{d.docType}</span> : <span className="text-ec-ink-3">—</span>}</td>
                        <td className="px-4 py-3.5 text-ec-ink-2">
                          {d.primary ? (
                            <span className="flex flex-col leading-tight">
                              <span className="font-medium text-ec-ink">{d.primary}</span>
                              {d.secondary && <span className="mt-0.5 text-xs text-ec-ink-3">{d.secondary}</span>}
                            </span>
                          ) : (
                            <span className="ec-chip ec-chip-warn">{t("unfiled")}</span>
                          )}
                        </td>
                        {/* Source chip — data-bound provenance (Gmail / Upload / Court order). */}
                        <td className="hidden px-4 py-3.5 md:table-cell"><span className="ec-chip">{d.sourceLabel}</span></td>
                        <td className="num hidden px-4 py-3.5 text-xs text-ec-ink-3 lg:table-cell">{d.sizeLabel}</td>
                        <td className="num hidden px-4 py-3.5 text-xs text-ec-ink-3 lg:table-cell">{d.dateLabel}</td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setPreview(d)}
                              className="rounded-ec-s p-1.5 text-ec-ink-3 hover:bg-ec-paper-3 hover:text-ec-ink"
                              aria-label={t("preview.quickLook")}
                              title={t("preview.quickLook")}
                            >
                              <Icon name="eye" className="h-4 w-4" />
                            </button>
                            <DocActions documentId={d.id} matterId={d.matterId} clientId={d.clientId} matters={matterOpts} clients={clientOpts} shared={d.shared} docType={d.docType} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          );
        })}
      </div>

      {/* Prominent bulk action bar — appears the moment anything is selected (shared WO-43 primitive). */}
      <BulkBar
        count={sel.size}
        label={t("bulk.selected", { n: sel.size })}
        clearLabel={t("bulk.clear")}
        onClear={clear}
      >
        {trash ? (
          <>
            <button onClick={onRestore} disabled={busy} className={btn}>{t("bulk.restore")}</button>
            <button onClick={onPurge} disabled={busy} className={`${btn} text-red-300`}>{t("bulk.purge")}</button>
          </>
        ) : (
          <>
            <button onClick={onExport} disabled={busy} className={btn}>{busy ? t("bulk.exporting") : t("bulk.export")}</button>
            {/* Client-first: file to a client, or tag to a case. */}
            <select
              onChange={(e) => { onFileClient(e.target.value); e.currentTarget.selectedIndex = 0; }}
              disabled={busy} defaultValue=""
              className="rounded-full bg-paper/15 px-3 py-1 text-sm text-paper focus:outline-none"
              aria-label={t("bulk.toClient")}
            >
              <option value="" className="text-ink">{t("bulk.toClient")}</option>
              {clientOpts.map((c) => <option key={c.id} value={c.id} className="text-ink">{c.label}</option>)}
            </select>
            <select
              onChange={(e) => { onFileCase(e.target.value); e.currentTarget.selectedIndex = 0; }}
              disabled={busy} defaultValue=""
              className="rounded-full bg-paper/15 px-3 py-1 text-sm text-paper focus:outline-none"
              aria-label={t("bulk.toCase")}
            >
              <option value="" className="text-ink">{t("bulk.toCase")}</option>
              {matterOpts.map((m) => <option key={m.id} value={m.id} className="text-ink">{m.label}</option>)}
            </select>
            <button onClick={onDelete} disabled={busy} className={`${btn} text-red-300`}>{t("bulk.delete")}</button>
          </>
        )}
      </BulkBar>

      {/* Undo toast — 10s window after a delete (shared WO-43 primitive). */}
      <UndoToast undo={undo} actionLabel={t("bulk.undo")} onUndo={onUndo} />

      {/* Export failure toast. */}
      {exportErr && (
        <div className="fixed inset-x-0 bottom-24 z-50 mx-auto flex w-fit items-center gap-3 rounded-ec-s bg-ec-danger px-4 py-2.5 text-ec-paper shadow-ec-2">
          <span className="text-sm">{t("bulk.exportFailed")}</span>
          <button onClick={() => setExportErr(false)} className="text-sm font-semibold underline">{t("bulk.clear")}</button>
        </div>
      )}

      {/* Quick-look preview modal — reuses the same viewer as the detail page. */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ec-ink/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={preview.filename}
          onClick={() => setPreview(null)}
        >
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-ec-m bg-ec-paper-2 shadow-ec-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-ec-hair bg-ec-paper-3 px-5 py-3.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <Icon name="documents" className="h-4 w-4 shrink-0 text-ec-ink-3" />
                <span className="truncate font-medium text-ec-ink">{preview.filename}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Link href={`/dashboard/documents/${preview.id}`} className="ec-btn ec-btn-ghost inline-flex items-center gap-1.5 !px-3 !py-1.5 text-sm" title={t("preview.open")}>
                  <Icon name="external" className="h-4 w-4" />
                  <span className="hidden sm:inline">{t("preview.open")}</span>
                </Link>
                <button ref={closeBtnRef} onClick={() => setPreview(null)} className="rounded-ec-s p-1.5 text-ec-ink-3 hover:bg-ec-paper-3 hover:text-ec-ink" aria-label={t("preview.close")}>
                  <Icon name="close" className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              <DocPreview documentId={preview.id} mime={preview.mime} filename={preview.filename} hasFile={preview.hasFile} className="h-[70vh]" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
