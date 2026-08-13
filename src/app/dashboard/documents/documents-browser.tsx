"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/icons";
import { DocActions } from "@/components/doc-actions";
import {
  useSelection, useUndo, BulkBar, bulkBtn, RowCheckbox, SelectAllCheckbox, UndoToast,
} from "@/components/selection";
import { Reveal } from "../motion";
import { DocViewerPanel } from "./doc-viewer-panel";
import {
  bulkDeleteDocuments, restoreDocuments, purgeDocuments, bulkFileToClient, bulkFileToCase,
} from "./actions";
import { downloadDocumentsZip } from "./export-zip";

export type DocRow = {
  id: string; filename: string; docType: string | null; mime: string | null;
  primary: string | null; secondary: string | null;
  // WO-334 · real fields the restored viewer panel's eyebrow/meta line binds to (matter cnr +
  // case title) — resolved server-side in page.tsx's toRow(), same as primary/secondary.
  caseLabel: string | null; cnr: string | null;
  sourceLabel: string; sizeLabel: string; dateLabel: string;
  matterId: string | null; clientId: string | null; shared: boolean;
  hasFile: boolean;
  // WO-334 EXACT-FIDELITY · the resolved client (direct tag, else via the tagged case) — the
  // "by client" grouping key on the ref-faithful main list (documents-list.tsx); a doc filed
  // only to a case still nests under its case's client. Same per-doc mapping (toRow() in
  // page.tsx) also feeds this table, so both consumers share one source of truth.
  resolvedClientId: string | null;
  // Same real definition the Review Inbox / attention-card count already uses (WO-33): flagged
  // needs_review OR genuinely unfiled — drives the ref's per-row Filed/Needs-review chip.
  needsReview: boolean;
  // The document's category icon (lib/docs/categories.ts) — real classification standing in for
  // the ref's fabricated 3-way order/pleading/annexure kind icon.
  iconName: IconName;
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
  // WO-334: focus-into-dialog / restore-on-close now lives inside DocViewerPanel itself.
  const [preview, setPreview] = useState<DocRow | null>(null);

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
      const ok = await downloadDocumentsZip([...sel.selected]);
      if (!ok) setExportErr(true);
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
        {sections.map((s, idx) => {
          const sectionIds = s.rows.map((r) => r.id);
          const allInSection = sel.allSelected(sectionIds);
          return (
            // WO-334 · section reveal (ported motion.tsx `Reveal`), staggered per group — matches
            // today-view.tsx's convention. Capped delay so a long document list doesn't keep the
            // last sections invisible for a full second.
            <Reveal key={s.cat} delay={Math.min(idx * 60, 240)}>
              {/* SectionLabel (Chambers): eyebrow row + thin hairline rule — the group divider
                  (category / client / case), not a filled band. */}
              <div className="flex items-end justify-between gap-3">
                <span className="flex items-center gap-2">
                  <Icon name={(s.icon as IconName) ?? "documents"} className="h-3.5 w-3.5 text-ec-bronze" />
                  <h2 className="ec-label !tracking-normal normal-case text-ec-ink">{s.label}</h2>
                </span>
                <span className="num text-xs text-ec-ink-3">{s.rows.length}</span>
              </div>
              <div className="mt-1.5 h-[3px] border-y border-ec-hair" />
              <div className="ec-card mt-3 overflow-hidden">
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
                    {/* WO-409 · fixed-width name column (was auto-sized, which let a long
                        unbroken filename stretch the whole table) — capped + break-words so a
                        long name wraps onto a second line instead. */}
                    <th className="w-[34%] px-3 py-3"><span className="ec-label">{t("field.file")}</span></th>
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
                            label={t("bulk.selectOne", { name: d.filename })}
                          />
                        </td>
                        <td className="w-[34%] px-3 py-3.5">
                          <Link href={`/dashboard/documents/${d.id}`} className="group flex items-start gap-2.5">
                            <Icon name="documents" className="mt-0.5 h-4 w-4 shrink-0 text-ec-ink-3" />
                            <span className="whitespace-normal break-words font-medium text-ec-ink group-hover:text-ec-bronze group-hover:underline">{d.filename}</span>
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
            </Reveal>
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
            <button onClick={onPurge} disabled={busy} className={`${btn} text-ec-danger`}>{t("bulk.purge")}</button>
          </>
        ) : (
          <>
            <button onClick={onExport} disabled={busy} className={btn}>{busy ? t("bulk.exporting") : t("bulk.export")}</button>
            {/* Client-first: file to a client, or tag to a case. WO-331: BulkBar retoned from a dark
                ink pill to a light card (components/selection/bulk-bar.tsx) — these inline selects
                follow suit instead of going invisible (light text on a now-light bar). */}
            <select
              onChange={(e) => { onFileClient(e.target.value); e.currentTarget.selectedIndex = 0; }}
              disabled={busy} defaultValue=""
              className={`${btn} bg-transparent pr-1`}
              aria-label={t("bulk.toClient")}
            >
              <option value="">{t("bulk.toClient")}</option>
              {clientOpts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <select
              onChange={(e) => { onFileCase(e.target.value); e.currentTarget.selectedIndex = 0; }}
              disabled={busy} defaultValue=""
              className={`${btn} bg-transparent pr-1`}
              aria-label={t("bulk.toCase")}
            >
              <option value="">{t("bulk.toCase")}</option>
              {matterOpts.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <button onClick={onDelete} disabled={busy} className={`${btn} text-ec-danger`}>{t("bulk.delete")}</button>
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

      {/* WO-334 · the restored Chambers Notes/zoom document viewer — was a plain centered
          quick-look modal; now the reference's right-hand slide-over with zoom controls and
          an (honestly-empty) Notes aside. Owns its own focus-management/entrance transition. */}
      {preview && <DocViewerPanel doc={preview} onClose={() => setPreview(null)} />}
    </>
  );
}
