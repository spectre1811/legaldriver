// Deterministic text extraction. PDFs via pdf-parse; text/* decoded directly.
// OCR fallback (tesseract.js) for image-only PDFs is a documented future step —
// flagged here rather than silently returning empty text.

export interface ExtractResult {
  text: string;
  method: "pdf" | "text" | "none";
  needsOcr?: boolean;
}

export async function extractText(buffer: Buffer, mime: string, filename = ""): Promise<ExtractResult> {
  const isPdf = mime === "application/pdf" || filename.toLowerCase().endsWith(".pdf");
  const isText =
    mime.startsWith("text/") ||
    /\.(txt|md|csv|eml)$/i.test(filename) ||
    mime === "message/rfc822";

  if (isPdf) {
    try {
      const mod = (await import("pdf-parse")) as unknown as {
        default?: (b: Buffer) => Promise<{ text: string }>;
      };
      const pdf = mod.default ?? (mod as unknown as (b: Buffer) => Promise<{ text: string }>);
      const result = await pdf(buffer);
      const text = (result.text ?? "").trim();
      // Image-only scans extract ~no text → flag for OCR (not run in MVP).
      if (text.length < 20) return { text, method: "pdf", needsOcr: true };
      return { text, method: "pdf" };
    } catch {
      return { text: "", method: "none", needsOcr: true };
    }
  }

  if (isText) {
    return { text: buffer.toString("utf8"), method: "text" };
  }

  // docx/xlsx and other binary types: not parsed in MVP (no text extracted).
  return { text: "", method: "none" };
}
