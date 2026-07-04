// WO-27 Wave 3 — decide how a document can be previewed inline. Pure + testable so the viewer
// component and the tests agree on exactly which files render in-app vs. fall back to download.

export type PreviewKind = "pdf" | "image" | "none";

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"]);

// Prefer the MIME type (authoritative), fall back to the filename extension when MIME is missing or
// generic (Gmail/upload often store application/octet-stream). Unknown → "none" (download-only).
export function previewKind(mime: string | null | undefined, filename: string | null | undefined): PreviewKind {
  const m = (mime ?? "").toLowerCase();
  if (m === "application/pdf") return "pdf";
  if (m.startsWith("image/")) return "image";

  const ext = (filename ?? "").toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "pdf";
  if (IMAGE_EXT.has(ext)) return "image";
  return "none";
}
