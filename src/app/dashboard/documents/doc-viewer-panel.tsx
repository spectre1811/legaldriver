"use client";

// WO-334 · restores the Chambers prototype's Notes/zoom document viewer
// (design-mockups/iteration3/console/app.documents.tsx `DocViewer`) — dropped when the
// Documents page first shipped. Faithful to the reference's layout (right-hand slide-over,
// page rail, zoomable canvas, Notes aside) with every value bound to real data. The
// `document` table has no `notes` column (no schema change in this WO — non-goal), and there
// is no per-document page-thumbnail extraction, so both the Notes aside and the page rail
// render an HONEST pending state in the prototype's exact chrome, never a fabricated one.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { DocPreview } from "@/components/doc-preview";
import type { DocRow } from "./documents-browser";

const ZOOM_MIN = 70;
const ZOOM_MAX = 160;
const ZOOM_STEP = 15;

export function DocViewerPanel({ doc, onClose }: { doc: DocRow; onClose: () => void }) {
  const t = useTranslations("documents");
  const [zoom, setZoom] = useState(100);
  const [shown, setShown] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Entrance transition (backdrop fade + panel slide-in-from-right), the same plain-CSS
  // convention as add-client-modal.tsx — mirrors the reference's `animate-in fade-in` /
  // `slide-in-from-right` without pulling in an animation library. Reduced-motion is already
  // neutralised globally (globals.css collapses every transition to ~0).
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    closeBtnRef.current?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = "";
    };
  }, []);

  const meta = [doc.caseLabel, doc.sourceLabel, doc.dateLabel].filter(Boolean).join(" · ");

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={doc.filename}>
      <div
        className={`absolute inset-0 bg-ec-ink/45 backdrop-blur-sm transition-opacity duration-200 ${shown ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <div
        className={`absolute inset-y-0 right-0 flex w-full max-w-4xl flex-col border-l border-ec-line-strong bg-ec-paper shadow-ec-2 transition-all duration-200 ease-out ${
          shown ? "translate-x-0 opacity-100" : "translate-x-6 opacity-0"
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ec-line bg-ec-card px-5 py-4">
          <div className="min-w-0">
            <div className="ec-label">{doc.cnr ?? doc.caseLabel ?? t("unfiled")}</div>
            <h2 className="mt-0.5 truncate font-display text-[19px] text-ec-ink">{doc.filename}</h2>
            {meta && <p className="truncate text-[12px] text-ec-muted-ink">{meta}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP))}
              disabled={zoom <= ZOOM_MIN}
              aria-label={t("viewer.zoomOut")}
              className="press rounded p-1.5 text-ec-muted-ink transition-colors hover:bg-ec-paper-3 hover:text-ec-bronze disabled:opacity-40"
            >
              <Icon name="minus" className="h-3.5 w-3.5" />
            </button>
            <span className="num w-10 text-center font-mono text-[11.5px] text-ec-ink-2">{zoom}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))}
              disabled={zoom >= ZOOM_MAX}
              aria-label={t("viewer.zoomIn")}
              className="press rounded p-1.5 text-ec-muted-ink transition-colors hover:bg-ec-paper-3 hover:text-ec-bronze disabled:opacity-40"
            >
              <Icon name="plus" className="h-3.5 w-3.5" />
            </button>
            <Link
              href={`/dashboard/documents/${doc.id}`}
              aria-label={t("preview.open")}
              title={t("preview.open")}
              className="rounded p-1.5 text-ec-muted-ink transition-colors hover:bg-ec-paper-3 hover:text-ec-bronze"
            >
              <Icon name="external" className="h-3.5 w-3.5" />
            </Link>
            {doc.hasFile && (
              <a
                href={`/api/documents/${doc.id}/download`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("download")}
                title={t("download")}
                className="rounded p-1.5 text-ec-muted-ink transition-colors hover:bg-ec-paper-3 hover:text-ec-bronze"
              >
                <Icon name="download" className="h-3.5 w-3.5" />
              </a>
            )}
            <button
              ref={closeBtnRef}
              type="button"
              onClick={onClose}
              aria-label={t("preview.close")}
              className="rounded p-1.5 text-ec-muted-ink transition-colors hover:bg-ec-paper-3 hover:text-ec-ink"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Page rail — the prototype ships real page thumbnails; we have no per-page
              extraction, so this is an honest pending skeleton, not fabricated pages. */}
          <div className="hidden w-28 shrink-0 space-y-3 overflow-auto border-r border-ec-line bg-ec-paper-3/50 p-3 sm:block">
            <div className="rounded-[4px] border border-ec-line bg-ec-card p-1">
              <div className="shimmer aspect-[1/1.414] w-full rounded-[2px]" />
            </div>
            <p className="text-center text-[10px] leading-snug text-ec-muted-ink">{t("viewer.pagesUnavailable")}</p>
          </div>

          <div className="min-w-0 flex-1 overflow-auto bg-ec-doc-well p-5">
            <div className="mx-auto max-w-3xl origin-top" style={{ transform: `scale(${zoom / 100})` }}>
              <DocPreview
                documentId={doc.id}
                mime={doc.mime}
                filename={doc.filename}
                hasFile={doc.hasFile}
                className="h-[32rem] max-h-[70vh] w-full"
              />
            </div>
          </div>

          {/* Notes aside — the prototype's exact chrome (SectionLabel + textarea + Save).
              `document` has no `notes` column (non-goal: no schema change in this WO), so this
              is disabled with an honest caption rather than a Save button that silently drops
              what you typed. */}
          <aside className="hidden w-64 shrink-0 border-l border-ec-line bg-ec-card p-4 lg:block">
            <div className="flex items-center gap-1.5">
              <Icon name="note" className="h-3.5 w-3.5 text-ec-bronze" />
              <div className="ec-label">{t("viewer.notes")}</div>
            </div>
            <div className="mt-1.5 h-[3px] border-y border-ec-line" />
            <textarea
              disabled
              rows={6}
              placeholder={t("viewer.notesPlaceholder")}
              className="mt-3 w-full cursor-not-allowed rounded-md border border-ec-line bg-ec-paper-3 p-2.5 text-[12.5px] text-ec-muted-ink outline-none"
            />
            <p className="mt-3 text-[11.5px] text-ec-muted-ink">{t("viewer.notesComingSoon")}</p>
          </aside>
        </div>
      </div>
    </div>
  );
}
