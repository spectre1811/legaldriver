"use client";

// WO-334 EXACT-FIDELITY · node-for-node port of app.documents.tsx's grouped document list — the
// simple by-case / by-client row layout the reference actually shows, replacing the category
// bulk-select table this page used for its main view (that table survives ONLY for Trash, in
// documents-browser.tsx, a state the reference never depicts). Real data throughout: the
// reference's fabricated `doc.filed` boolean is the same "needs review" definition the Review
// Inbox count already uses (WO-33), and its 3-way order/pleading/annexure icon is the document's
// real classified category icon (lib/docs/categories.ts).
//
// WO-409 E4 · adds the bulk-select this list never had (Trash's table was the only selectable
// surface): Gmail-style hover-revealed checkboxes + a per-case-group select-all, wired to the
// SAME real primitives Trash already uses (`useSelection`/`BulkBar`/`useUndo`) and exactly the two
// actions the design calls for — Download (the real zip-export route, shared with Trash via
// export-zip.ts) and Move to trash (the real reversible soft-delete, with the same Undo toast).
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/icons";
import { useSelection, useUndo, BulkBar, bulkBtn, RowCheckbox, SelectAllCheckbox, UndoToast, type UseSelection } from "@/components/selection";
import { DocViewerPanel } from "./doc-viewer-panel";
import { bulkDeleteDocuments, restoreDocuments } from "./actions";
import { downloadDocumentsZip } from "./export-zip";
import type { DocRow } from "./documents-browser";

export type CaseSection = { key: string; caseLabel: string; cnr: string | null; rows: DocRow[] };
export type ClientSection = { key: string; clientLabel: string; cases: CaseSection[] };

type Props =
  | { mode: "case"; sections: CaseSection[] }
  | { mode: "client"; sections: ClientSection[] };

export function DocumentsList(props: Props) {
  const t = useTranslations("documents");
  const router = useRouter();
  const [preview, setPreview] = useState<DocRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportErr, setExportErr] = useState(false);

  const orderedIds =
    props.mode === "case"
      ? props.sections.flatMap((s) => s.rows.map((r) => r.id))
      : props.sections.flatMap((cs) => cs.cases.flatMap((c) => c.rows.map((r) => r.id)));
  const sel = useSelection(orderedIds, { escClears: false });
  const { undo, show: showUndo, dismiss: dismissUndo } = useUndo();

  // Escape closes the quick-look preview first, and only then clears the selection — same
  // convention as documents-browser.tsx's Trash table.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (preview) setPreview(null);
      else sel.clear();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sel.clear is stable (useCallback, no deps)
  }, [preview]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try { await fn(); router.refresh(); } finally { setBusy(false); }
  }
  async function onMoveToTrash() {
    const ids = [...sel.selected];
    await run(async () => { const r = await bulkDeleteDocuments(ids); showUndo(ids, r.message); });
    sel.clear();
  }
  async function onUndo() {
    if (!undo) return;
    const ids = undo.ids; dismissUndo();
    await run(() => restoreDocuments(ids));
  }
  async function onDownload() {
    setExportErr(false);
    setBusy(true);
    const ok = await downloadDocumentsZip([...sel.selected]);
    if (!ok) setExportErr(true);
    setBusy(false);
  }

  return (
    <>
      {props.mode === "case" ? (
        <div className="space-y-9">
          {props.sections.map((s) => (
            <CaseGroup key={s.key} section={s} onOpen={setPreview} sel={sel} />
          ))}
        </div>
      ) : (
        <ClientGroups sections={props.sections} onOpen={setPreview} sel={sel} />
      )}

      <BulkBar count={sel.size} label={t("bulk.selected", { n: sel.size })} clearLabel={t("bulk.clear")} onClear={sel.clear}>
        <button onClick={onDownload} disabled={busy} className={bulkBtn}>{t("bulk.download")}</button>
        <button onClick={onMoveToTrash} disabled={busy} className={`${bulkBtn} text-ec-danger`}>{t("bulk.moveToTrash")}</button>
      </BulkBar>
      <UndoToast undo={undo} actionLabel={t("bulk.undo")} onUndo={onUndo} />
      {exportErr && (
        <div className="fixed inset-x-0 bottom-24 z-50 mx-auto flex w-fit items-center gap-3 rounded-ec-s bg-ec-danger px-4 py-2.5 text-ec-paper shadow-ec-2">
          <span className="text-sm">{t("bulk.exportFailed")}</span>
          <button onClick={() => setExportErr(false)} className="text-sm font-semibold underline">{t("bulk.clear")}</button>
        </div>
      )}

      {preview && <DocViewerPanel doc={preview} onClose={() => setPreview(null)} />}
    </>
  );
}

function CaseGroup({ section, onOpen, sel }: { section: CaseSection; onOpen: (d: DocRow) => void; sel: UseSelection }) {
  const t = useTranslations("documents");
  const ids = section.rows.map((r) => r.id);
  return (
    <section>
      <div className="mb-3">
        <div className="flex items-end justify-between gap-3">
          <span className="flex items-center gap-2.5">
            <SelectAllCheckbox checked={sel.allSelected(ids)} onToggle={() => sel.toggleGroup(ids)} label={t("bulk.selectAll")} />
            <span className="font-display text-[15px] normal-case tracking-normal text-ec-ink">{section.caseLabel}</span>
          </span>
          {section.cnr && (
            <span className="num font-mono text-[10.5px] uppercase tracking-[0.08em] text-ec-muted-ink">{section.cnr}</span>
          )}
        </div>
        <div className="mt-1.5 h-[3px] border-y border-ec-hair" />
      </div>
      <ul className="divide-y divide-ec-hair">
        {section.rows.map((d) => <DocRowItem key={d.id} doc={d} onOpen={onOpen} sel={sel} />)}
      </ul>
    </section>
  );
}

function ClientGroups({ sections, onOpen, sel }: { sections: ClientSection[]; onOpen: (d: DocRow) => void; sel: UseSelection }) {
  const t = useTranslations("documents");
  return (
    <div className="space-y-10">
      {sections.map((cs) => {
        const total = cs.cases.reduce((n, c) => n + c.rows.length, 0);
        return (
          <section key={cs.key}>
            <div className="mb-3">
              <div className="flex items-end justify-between gap-3">
                <span className="font-display text-[16px] normal-case tracking-normal text-ec-ink">{cs.clientLabel}</span>
                <span className="num font-mono text-[10.5px] text-ec-muted-ink">{t("group.docCount", { n: total })}</span>
              </div>
              <div className="mt-1.5 h-[3px] border-y border-ec-hair" />
            </div>
            <div className="space-y-5 pl-0 sm:pl-4">
              {cs.cases.map((c) => {
                const ids = c.rows.map((r) => r.id);
                return (
                  <div key={c.key} className="ec-rule-left pl-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <SelectAllCheckbox checked={sel.allSelected(ids)} onToggle={() => sel.toggleGroup(ids)} label={t("bulk.selectAll")} />
                        <span className="font-display text-[14px] text-ec-ink">{c.caseLabel}</span>
                      </span>
                      {c.cnr && (
                        <span className="num font-mono text-[10.5px] uppercase tracking-[0.08em] text-ec-muted-ink">{c.cnr}</span>
                      )}
                    </div>
                    <ul className="divide-y divide-ec-hair">
                      {c.rows.map((d) => <DocRowItem key={d.id} doc={d} onOpen={onOpen} sel={sel} />)}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function DocRowItem({ doc, onOpen, sel }: { doc: DocRow; onOpen: (d: DocRow) => void; sel: UseSelection }) {
  const t = useTranslations("documents");
  const Kind = doc.iconName as IconName;
  const checked = sel.isSelected(doc.id);
  // Gmail-style: hidden until you hover/focus a row, but once ANYTHING is selected every
  // checkbox in the list stays visible (so you can see + extend the whole selection at a glance).
  const checkboxVisible = checked || sel.size > 0;
  return (
    <li className={`group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3 transition-colors hover:bg-ec-bronze-tint/25 sm:grid-cols-[auto_minmax(0,1fr)_100px_72px_110px_auto_28px] ${checked ? "bg-ec-brass-tint/30" : ""}`}>
      <span className={`shrink-0 transition-opacity ${checkboxVisible ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}>
        <RowCheckbox checked={checked} onSelect={(shift) => sel.onRowClick(doc.id, shift)} label={t("bulk.selectOne", { name: doc.filename })} />
      </span>
      <button type="button" onClick={() => onOpen(doc)} className="flex min-w-0 items-start gap-2.5 text-left">
        <Icon name={Kind} className="mt-0.5 h-[15px] w-[15px] shrink-0 text-ec-bronze" />
        {/* WO-409 · the truncation bug: this used to `truncate` (ellipsis-cut) a long filename —
            the column is already flexible (minmax(0,1fr)), so it just needs to wrap instead. */}
        <span className="min-w-0 whitespace-normal break-words text-[14px] text-ec-ink hover:text-ec-bronze">{doc.filename}</span>
      </button>
      <span className="ec-chip hidden justify-self-start sm:inline-block">{doc.sourceLabel}</span>
      <span className="num hidden font-mono text-[11px] text-ec-muted-ink sm:block">{doc.sizeLabel}</span>
      <span className="num hidden font-mono text-[11.5px] text-ec-muted-ink sm:block">{doc.dateLabel}</span>
      {doc.needsReview ? (
        <span className="ec-chip ec-chip-warn">{t("stat.review")}</span>
      ) : (
        <span className="ec-chip ec-chip-success">{t("filter.filed")}</span>
      )}
      <button
        type="button"
        onClick={() => onOpen(doc)}
        aria-label={t("viewer.notes")}
        title={t("viewer.notes")}
        className="hidden justify-self-end rounded p-1 text-ec-muted-ink transition-colors hover:bg-ec-paper-3 hover:text-ec-bronze sm:block"
      >
        <Icon name="note" className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
