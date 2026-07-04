"use client";

import { useTranslations } from "next-intl";
import { previewKind } from "@/lib/docs/preview-kind";
import { Icon } from "@/components/icons";

// WO-27 Wave 3 — inline document preview. Renders the ACTUAL file (not just the extracted text)
// in-app: PDFs in an iframe, images inline, everything else a graceful download fallback. The src
// is the tenant-checked download route, which 302s to a short-lived signed URL — so preview reuses
// the exact same auth path as download (no new storage surface). Used both on the document detail
// page and in the list quick-look modal.
export function DocPreview({
  documentId,
  mime,
  filename,
  hasFile = true,
  className = "",
}: {
  documentId: string;
  mime: string | null;
  filename: string | null;
  // False when the DB record has no stored object yet — the download route would 404 with
  // JSON, which an <iframe>/<img> renders as raw `{"error":"not found"}`. Show a human state
  // instead of ever embedding that URL. Defaults true so existing callers keep working.
  hasFile?: boolean;
  className?: string;
}) {
  const t = useTranslations("documents");
  const kind = previewKind(mime, filename);
  const src = `/api/documents/${documentId}/download`;
  const frame = "w-full rounded-xl border border-line bg-paper";

  // No stored bytes → never embed the download URL (it would show raw error JSON). QA-N2/N3.
  if (!hasFile) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-paper/50 px-6 py-12 text-center ${className}`}>
        <Icon name="documents" className="h-8 w-8 text-ink-faint" />
        <p className="text-sm font-medium text-ink">{t("preview.noFile")}</p>
        <p className="max-w-xs text-xs text-ink-faint">{t("preview.noFileBody")}</p>
      </div>
    );
  }

  if (kind === "pdf") {
    return <iframe src={src} title={filename ?? t("untitled")} className={`${frame} ${className || "h-[34rem]"}`} />;
  }

  if (kind === "image") {
    return (
      <div className={`grid place-items-center overflow-auto ${frame} ${className || "max-h-[34rem] p-3"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={filename ?? t("untitled")} className="mx-auto max-h-[32rem] w-auto rounded-lg" />
      </div>
    );
  }

  // Unpreviewable (e.g. .docx, .xlsx, octet-stream) — offer the file, point at the text below.
  return (
    <div className={`flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line bg-paper/50 px-6 py-12 text-center ${className}`}>
      <Icon name="documents" className="h-8 w-8 text-ink-faint" />
      <div>
        <p className="text-sm font-medium text-ink">{t("preview.unavailable")}</p>
        <p className="mt-1 text-xs text-ink-faint">{t("preview.unavailableBody")}</p>
      </div>
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-ghost inline-flex items-center gap-1.5 text-sm"
      >
        <Icon name="external" className="h-4 w-4" /> {t("preview.download")}
      </a>
    </div>
  );
}
