"use client";

// WO-334 EXACT-FIDELITY · node-for-node port of app.documents.tsx's grouped document list — the
// simple by-case / by-client row layout the reference actually shows, replacing the category
// bulk-select table this page used for its main view (that table survives ONLY for Trash, in
// documents-browser.tsx, a state the reference never depicts). Real data throughout: the
// reference's fabricated `doc.filed` boolean is the same "needs review" definition the Review
// Inbox count already uses (WO-33), and its 3-way order/pleading/annexure icon is the document's
// real classified category icon (lib/docs/categories.ts).
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/icons";
import { DocViewerPanel } from "./doc-viewer-panel";
import type { DocRow } from "./documents-browser";

export type CaseSection = { key: string; caseLabel: string; cnr: string | null; rows: DocRow[] };
export type ClientSection = { key: string; clientLabel: string; cases: CaseSection[] };

type Props =
  | { mode: "case"; sections: CaseSection[] }
  | { mode: "client"; sections: ClientSection[] };

export function DocumentsList(props: Props) {
  const [preview, setPreview] = useState<DocRow | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPreview(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {props.mode === "case" ? (
        <div className="space-y-9">
          {props.sections.map((s) => (
            <CaseGroup key={s.key} section={s} onOpen={setPreview} />
          ))}
        </div>
      ) : (
        <ClientGroups sections={props.sections} onOpen={setPreview} />
      )}

      {preview && <DocViewerPanel doc={preview} onClose={() => setPreview(null)} />}
    </>
  );
}

function CaseGroup({ section, onOpen }: { section: CaseSection; onOpen: (d: DocRow) => void }) {
  return (
    <section>
      <div className="mb-3">
        <div className="flex items-end justify-between gap-3">
          <span className="font-display text-[15px] normal-case tracking-normal text-ec-ink">{section.caseLabel}</span>
          {section.cnr && (
            <span className="num font-mono text-[10.5px] uppercase tracking-[0.08em] text-ec-muted-ink">{section.cnr}</span>
          )}
        </div>
        <div className="mt-1.5 h-[3px] border-y border-ec-hair" />
      </div>
      <ul className="divide-y divide-ec-hair">
        {section.rows.map((d) => <DocRowItem key={d.id} doc={d} onOpen={onOpen} />)}
      </ul>
    </section>
  );
}

function ClientGroups({ sections, onOpen }: { sections: ClientSection[]; onOpen: (d: DocRow) => void }) {
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
              {cs.cases.map((c) => (
                <div key={c.key} className="ec-rule-left pl-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-display text-[14px] text-ec-ink">{c.caseLabel}</span>
                    {c.cnr && (
                      <span className="num font-mono text-[10.5px] uppercase tracking-[0.08em] text-ec-muted-ink">{c.cnr}</span>
                    )}
                  </div>
                  <ul className="divide-y divide-ec-hair">
                    {c.rows.map((d) => <DocRowItem key={d.id} doc={d} onOpen={onOpen} />)}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function DocRowItem({ doc, onOpen }: { doc: DocRow; onOpen: (d: DocRow) => void }) {
  const t = useTranslations("documents");
  const Kind = doc.iconName as IconName;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 transition-colors hover:bg-ec-bronze-tint/25 sm:grid-cols-[minmax(0,1fr)_100px_110px_auto_28px]">
      <button type="button" onClick={() => onOpen(doc)} className="flex min-w-0 items-center gap-2.5 text-left">
        <Icon name={Kind} className="h-[15px] w-[15px] shrink-0 text-ec-bronze" />
        {/* The reference's second "Note: …" line under the title (an italic note preview) is
            omitted — same reasoning as the viewer's Notes aside (doc-viewer-panel.tsx): `document`
            has no notes column yet (no schema change in this WO), so there is never a real value
            to preview. Not a removed element, an honestly-absent one, consistent with the panel. */}
        <span className="min-w-0 truncate text-[14px] text-ec-ink hover:text-ec-bronze">{doc.filename}</span>
      </button>
      <span className="num hidden font-mono text-[11px] uppercase tracking-[0.08em] text-ec-muted-ink sm:block">{doc.sourceLabel}</span>
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
