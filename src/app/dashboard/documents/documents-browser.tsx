"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/icons";
import { Badge } from "@/components/ui";
import { DocActions } from "@/components/doc-actions";
import { DocPreview } from "@/components/doc-preview";
import { rangeIds, toggle } from "@/lib/select-range";
import {
  bulkDeleteDocuments, restoreDocuments, purgeDocuments, bulkFileToClient, bulkFileToCase,
} from "./actions";

export type DocRow = {
  id: string; filename: string; docType: string | null; mime: string | null;
  primary: string | null; secondary: string | null;
  sourceLabel: string; sizeLabel: string; dateLabel: string;
  matterId: string | null; clientId: string | null; shared: boolean;
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
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<{ ids: string[]; label: string } | null>(null);
  const [exportErr, setExportErr] = useState(false);
  const [preview, setPreview] = useState<DocRow | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => { setSel(new Set()); setAnchor(null); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (preview) setPreview(null); // close the quick-look first…
      else clear();                  // …otherwise drop the selection
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clear, preview]);

  function onRowClick(id: string, shift: boolean) {
    if (shift && anchor) {
      const ids = rangeIds(orderedIds, anchor, id);
      setSel((prev) => { const n = new Set(prev); ids.forEach((x) => n.add(x)); return n; });
    } else {
      setSel((prev) => toggle(prev, id));
      setAnchor(id);
    }
  }

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try { await fn(); router.refresh(); } finally { setBusy(false); }
  }
  function showUndo(ids: string[], label: string) {
    setUndo({ ids, label });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 10000);
  }
  async function onDelete() {
    const ids = [...sel];
    await run(async () => { const r = await bulkDeleteDocuments(ids); showUndo(ids, r.message); });
    clear();
  }
  async function onUndo() {
    if (!undo) return;
    const ids = undo.ids; setUndo(null);
    await run(() => restoreDocuments(ids));
  }
  async function onRestore() { const ids = [...sel]; await run(() => restoreDocuments(ids)); clear(); }
  async function onPurge() {
    if (!window.confirm(t("bulk.purgeConfirm", { n: sel.size }))) return;
    const ids = [...sel]; await run(() => purgeDocuments(ids)); clear();
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
        body: JSON.stringify({ ids: [...sel] }),
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
    const ids = [...sel]; await run(() => bulkFileToClient(ids, clientId)); clear();
  }
  async function onFileCase(matterId: string) {
    if (!matterId) return;
    const ids = [...sel]; await run(() => bulkFileToCase(ids, matterId)); clear();
  }

  const btn = "rounded-full px-3 py-1 text-sm font-medium hover:bg-paper/20 disabled:opacity-50";

  return (
    <>
      <div className="space-y-6 pb-16">
        {sections.map((s) => {
          const sectionIds = s.rows.map((r) => r.id);
          const allInSection = sectionIds.length > 0 && sectionIds.every((id) => sel.has(id));
          return (
            <div key={s.cat} className="ec-card overflow-hidden">
              <div className="flex items-center gap-2.5 border-b border-line bg-paper/60 px-5 py-3">
                <Icon name={(s.icon as IconName) ?? "documents"} className="h-4 w-4 text-brand-600" />
                <h2 className="text-sm font-semibold text-ink">{s.label}</h2>
                <span className="text-xs text-ink-faint">{s.rows.length}</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox" checked={allInSection}
                        onChange={() => setSel((prev) => {
                          const n = new Set(prev);
                          if (allInSection) sectionIds.forEach((id) => n.delete(id)); else sectionIds.forEach((id) => n.add(id));
                          return n;
                        })}
                        className="h-4 w-4 cursor-pointer accent-brand-600" aria-label={t("bulk.selectAll")}
                      />
                    </th>
                    <th className="px-3 py-3 label">{t("field.file")}</th>
                    <th className="hidden px-4 py-3 label sm:table-cell">{t("field.type")}</th>
                    <th className="px-4 py-3 label">{t("field.filedUnder")}</th>
                    <th className="hidden px-4 py-3 label md:table-cell">{t("field.source")}</th>
                    <th className="hidden px-4 py-3 label lg:table-cell">{t("field.size")}</th>
                    <th className="hidden px-4 py-3 label lg:table-cell">{t("field.added")}</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {s.rows.map((d) => {
                    const checked = sel.has(d.id);
                    return (
                      <tr key={d.id} className={`border-b border-line last:border-0 ${checked ? "bg-brand-50" : "hover:bg-paper"}`}>
                        <td className="px-4 py-3.5">
                          <input
                            type="checkbox" checked={checked}
                            onClick={(e) => onRowClick(d.id, e.shiftKey)}
                            onChange={() => { /* handled in onClick to read shiftKey */ }}
                            className="h-4 w-4 cursor-pointer accent-brand-600" aria-label={`Select ${d.filename}`}
                          />
                        </td>
                        <td className="px-3 py-3.5">
                          <Link href={`/dashboard/documents/${d.id}`} className="group flex items-center gap-2.5">
                            <Icon name="documents" className="h-4 w-4 shrink-0 text-ink-faint" />
                            <span className="font-medium text-ink group-hover:text-brand-700 group-hover:underline">{d.filename}</span>
                          </Link>
                        </td>
                        <td className="hidden px-4 py-3.5 sm:table-cell">{d.docType ? <Badge>{d.docType}</Badge> : <span className="text-ink-faint">—</span>}</td>
                        <td className="px-4 py-3.5 text-ink-muted">
                          {d.primary ? (
                            <span className="flex flex-col leading-tight">
                              <span className="font-medium text-ink">{d.primary}</span>
                              {d.secondary && <span className="mt-0.5 text-xs text-ink-faint">{d.secondary}</span>}
                            </span>
                          ) : (
                            <span className="text-amber-600">{t("unfiled")}</span>
                          )}
                        </td>
                        <td className="hidden px-4 py-3.5 text-xs text-ink-faint md:table-cell">{d.sourceLabel}</td>
                        <td className="hidden px-4 py-3.5 text-xs text-ink-faint lg:table-cell">{d.sizeLabel}</td>
                        <td className="hidden px-4 py-3.5 text-xs text-ink-faint lg:table-cell">{d.dateLabel}</td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setPreview(d)}
                              className="rounded-lg p-1.5 text-ink-faint hover:bg-paper hover:text-ink"
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
          );
        })}
      </div>

      {/* Prominent bulk action bar — appears the moment anything is selected. */}
      {sel.size > 0 && (
        <div className="fixed inset-x-0 bottom-6 z-40 mx-auto flex w-fit items-center gap-1.5 rounded-full border border-ink/10 bg-ink px-4 py-2.5 text-paper shadow-xl">
          <span className="px-1 text-sm font-semibold">{t("bulk.selected", { n: sel.size })}</span>
          <div className="mx-1 h-5 w-px bg-paper/25" />
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
          <button onClick={clear} className={btn} aria-label={t("bulk.clear")}>✕</button>
        </div>
      )}

      {/* Undo toast — 10s window after a delete. */}
      {undo && (
        <div className="fixed inset-x-0 bottom-24 z-50 mx-auto flex w-fit items-center gap-3 rounded-lg bg-ink px-4 py-2.5 text-paper shadow-xl">
          <span className="text-sm">{undo.label}</span>
          <button onClick={onUndo} className="text-sm font-semibold text-brand-200 underline">{t("bulk.undo")}</button>
        </div>
      )}

      {/* Export failure toast. */}
      {exportErr && (
        <div className="fixed inset-x-0 bottom-24 z-50 mx-auto flex w-fit items-center gap-3 rounded-lg bg-red-600 px-4 py-2.5 text-paper shadow-xl">
          <span className="text-sm">{t("bulk.exportFailed")}</span>
          <button onClick={() => setExportErr(false)} className="text-sm font-semibold underline">{t("bulk.clear")}</button>
        </div>
      )}

      {/* Quick-look preview modal — reuses the same viewer as the detail page. */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={preview.filename}
          onClick={() => setPreview(null)}
        >
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <Icon name="documents" className="h-4 w-4 shrink-0 text-ink-faint" />
                <span className="truncate font-medium text-ink">{preview.filename}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Link href={`/dashboard/documents/${preview.id}`} className="btn-ghost inline-flex items-center gap-1.5 text-sm" title={t("preview.open")}>
                  <Icon name="external" className="h-4 w-4" />
                  <span className="hidden sm:inline">{t("preview.open")}</span>
                </Link>
                <button onClick={() => setPreview(null)} className="rounded-lg p-1.5 text-ink-faint hover:bg-paper hover:text-ink" aria-label={t("preview.close")}>
                  <Icon name="close" className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              <DocPreview documentId={preview.id} mime={preview.mime} filename={preview.filename} className="h-[70vh]" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
