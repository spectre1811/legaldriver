"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { DocPreview } from "@/components/doc-preview";
import { previewKind } from "@/lib/docs/preview-kind";

const ZOOM_MIN = 80;
const ZOOM_MAX = 160;
const ZOOM_STEP = 10;

export type MailAttachment = { id: string; filename: string; mime: string | null; sizeLabel: string; docType: string | null };

// WO-335 · the Chambers reference's inline attachment DocPreview (page rail, zoom, download,
// maximize) — reuses the SAME shared `DocPreview` primitive doc-viewer-panel.tsx renders (real
// PDF/image via the tenant-checked download route), wrapped in the reference's own zoom chrome.
// The reference's fake "Page 1/2" flips between two hand-written mock pages; a real embedded PDF
// (iframe) already carries its own native page navigation, so a second, non-functional pager
// would be decoration that does nothing — omitted honestly rather than faked (noted in the PR).
export function AttachmentPreview({ attachment }: { attachment: MailAttachment }) {
  const t = useTranslations("dashboard.inbox");
  const td = useTranslations("documents"); // reuse the identical viewer/download copy — WO-334 already carries it
  const [zoom, setZoom] = useState(100);
  const kind = previewKind(attachment.mime, attachment.filename);

  return (
    <div className="overflow-hidden rounded-md border border-ec-line bg-ec-doc-well">
      <div className="flex flex-wrap items-center gap-1 border-b border-ec-line bg-ec-card px-3 py-1.5">
        <span className="ec-mono-label">{kind === "pdf" ? "PDF" : kind === "image" ? t("attachments.image") : t("attachments.file")}</span>
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP))}
            disabled={zoom <= ZOOM_MIN}
            aria-label={td("viewer.zoomOut")}
            className="rounded border border-ec-line p-0.5 text-ec-ink-2 disabled:opacity-30"
          >
            <Icon name="minus" className="h-3.5 w-3.5" />
          </button>
          <span className="num text-[10.5px] text-ec-muted-ink">{zoom}%</span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))}
            disabled={zoom >= ZOOM_MAX}
            aria-label={td("viewer.zoomIn")}
            className="rounded border border-ec-line p-0.5 text-ec-ink-2 disabled:opacity-30"
          >
            <Icon name="plus" className="h-3.5 w-3.5" />
          </button>
          <Link
            href={`/dashboard/documents/${attachment.id}`}
            aria-label={td("preview.open")}
            title={td("preview.open")}
            className="rounded border border-ec-line p-0.5 text-ec-ink-2 hover:border-ec-bronze hover:text-ec-bronze"
          >
            <Icon name="external" className="h-3.5 w-3.5" />
          </Link>
          <a
            href={`/api/documents/${attachment.id}/download`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={td("download")}
            title={td("download")}
            className="rounded border border-ec-line p-0.5 text-ec-ink-2 hover:border-ec-bronze hover:text-ec-bronze"
          >
            <Icon name="download" className="h-3.5 w-3.5" />
          </a>
        </span>
      </div>
      <div className="max-h-[280px] overflow-auto p-3">
        <div className="mx-auto origin-top" style={{ transform: `scale(${zoom / 100})` }}>
          <DocPreview documentId={attachment.id} mime={attachment.mime} filename={attachment.filename} className="max-h-[260px] w-full" />
        </div>
      </div>
    </div>
  );
}
