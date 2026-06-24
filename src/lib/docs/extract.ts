// Deterministic text extraction. PDFs via pdf-parse; text/* decoded directly.
// OCR fallback (tesseract.js) for image-only PDFs is a documented future step —
// flagged here rather than silently returning empty text.

export interface ExtractResult {
  text: string;
  method: "pdf" | "text" | "none";
  needsOcr?: boolean;
  error?: string; // diagnostic when PDF extraction throws (e.g. serverless bundling)
}

export async function extractText(buffer: Buffer, mime: string, filename = ""): Promise<ExtractResult> {
  const isPdf = mime === "application/pdf" || filename.toLowerCase().endsWith(".pdf");
  const isText =
    mime.startsWith("text/") ||
    /\.(txt|md|csv|eml)$/i.test(filename) ||
    mime === "message/rfc822";

  if (isPdf) {
    // unpdf: serverless-safe PDF text extraction (bundles a Node/worker-free pdfjs
    // build — no DOMMatrix/canvas deps, unlike pdf-parse which fails on Vercel).
    try {
      const { extractText: pdfExtractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text: raw } = await pdfExtractText(pdf, { mergePages: true });
      const text = (Array.isArray(raw) ? raw.join("\n") : raw ?? "").trim();
      // Image-only scans extract ~no text → flag for OCR (not run in MVP).
      if (text.length < 20) return { text, method: "pdf", needsOcr: true };
      return { text, method: "pdf" };
    } catch (e) {
      return { text: "", method: "none", needsOcr: true, error: e instanceof Error ? e.message : "pdf parse failed" };
    }
  }

  if (isText) {
    return { text: buffer.toString("utf8"), method: "text" };
  }

  // docx/xlsx and other binary types: not parsed in MVP (no text extracted).
  return { text: "", method: "none" };
}
