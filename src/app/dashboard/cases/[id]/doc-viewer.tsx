"use client";

// WO-332 · the prototype's right-edge "Document" slide-over — wraps the REAL DocPreview (iframe/img/
// download-fallback over the tenant-checked /api/documents/:id/download route), not the reference's
// static dummy order text. Chrome + a11y (Escape closes, focus moves in, body scroll locked) mirrors
// the existing cases-list detail drawer (src/components/cases/case-detail-drawer.tsx) so the console
// has one slide-over motion language, not two.
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { DocActions } from "@/components/doc-actions";
import { DocPreview } from "@/components/doc-preview";

export type CaseDocRow = {
  id: string; filename: string; docType: string | null; mime: string | null;
  dateLabel: string | null; hasFile: boolean; shared: boolean; clientId: string | null;
};
type Opt = { id: string; label: string };

export function DocumentsCard({
  docs, matterId, matterOpts, clientOpts,
}: {
  docs: CaseDocRow[]; matterId: string; matterOpts: Opt[]; clientOpts: Opt[];
}) {
  const t = useTranslations("caseDetail");
  const [active, setActive] = useState<CaseDocRow | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setActive(null); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [active]);

  return (
    <>
      <ul className="divide-y divide-ec-hair">
        {docs.map((d) => (
          <li key={d.id} className="flex items-center gap-1 px-1">
            <button
              type="button"
              onClick={() => setActive(d)}
              className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-ec-bronze-tint/30"
            >
              <Icon name="documents" className="h-3.5 w-3.5 shrink-0 text-ec-ink-3" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-ec-ink">{d.filename}</span>
                <span className="num block text-[10.5px] text-ec-ink-3">
                  {d.docType ?? t("documents.untyped")}{d.dateLabel ? ` · ${d.dateLabel}` : ""}
                </span>
              </span>
            </button>
            <DocActions documentId={d.id} matterId={matterId} clientId={d.clientId} matters={matterOpts} clients={clientOpts} shared={d.shared} />
          </li>
        ))}
      </ul>

      {active && (
        <div className="fixed inset-0 z-[70] flex justify-end" role="dialog" aria-modal="true" aria-label={active.filename}>
          <div
            className="absolute inset-0 bg-ec-ink/40 backdrop-blur-sm motion-safe:animate-fade-in"
            onClick={() => setActive(null)}
          />
          <div className="relative flex h-full w-full max-w-2xl flex-col border-l border-ec-hair-strong bg-ec-paper-2 shadow-ec-2 motion-safe:animate-slide-in-right">
            <div className="flex items-center justify-between gap-3 border-b border-ec-hair px-5 py-3.5">
              <div className="min-w-0">
                <div className="ec-label">{t("documents.title")}</div>
                <div className="truncate font-display text-[16px] text-ec-ink">{active.filename}</div>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setActive(null)}
                aria-label={t("actions.cancel")}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ec-ink-3 hover:bg-ec-paper-3 hover:text-ec-ink"
              >
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-ec-paper-3/50 p-4">
              <DocPreview documentId={active.id} mime={active.mime} filename={active.filename} hasFile={active.hasFile} className="h-full min-h-[70vh]" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
