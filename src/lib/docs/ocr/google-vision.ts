import type { OcrProvider, OcrResult } from "./types";

// Quality fallback OCR: Google Cloud Vision DOCUMENT_TEXT_DETECTION (REST, key-gated).
// Officially supports Hindi + Gujarati and auto-detects language in document mode;
// strong on real-world skewed scans. Key-gated → bytes go to Google, so this is
// opt-in per deployment (default OCR stays on-box). Returns null without a key.
//
// Images use images:annotate; PDFs use files:annotate (inline, base64) which
// Vision accepts directly (no rasterisation needed).

const KEY = () => process.env.GOOGLE_VISION_API_KEY;
const MAX_PDF_PAGES = Number(process.env.OCR_MAX_PAGES ?? "20");

function meanConfidence(pages: unknown[]): number {
  const confs: number[] = [];
  for (const p of pages as { confidence?: number }[]) if (typeof p?.confidence === "number") confs.push(p.confidence);
  if (!confs.length) return 0.8; // Vision often omits page confidence; assume strong
  return Math.max(0, Math.min(1, confs.reduce((a, b) => a + b, 0) / confs.length));
}

function langHints(fullTextAnnotation: unknown): string[] {
  const seen = new Set<string>();
  const pages = (fullTextAnnotation as { pages?: { property?: { detectedLanguages?: { languageCode?: string }[] } }[] })?.pages ?? [];
  for (const pg of pages) for (const dl of pg.property?.detectedLanguages ?? []) if (dl.languageCode) seen.add(dl.languageCode);
  return [...seen];
}

export const googleVisionProvider: OcrProvider = {
  name: "google",
  async ocr(buf, mime): Promise<OcrResult | null> {
    const key = KEY();
    if (!key) return null;
    const b64 = buf.toString("base64");
    try {
      if (mime === "application/pdf") {
        const res = await fetch(`https://vision.googleapis.com/v1/files:annotate?key=${key}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requests: [{
              inputConfig: { mimeType: "application/pdf", content: b64 },
              features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
              pages: Array.from({ length: MAX_PDF_PAGES }, (_, i) => i + 1),
            }],
          }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        const responses = data?.responses?.[0]?.responses ?? [];
        const texts: string[] = [];
        const allLangs = new Set<string>();
        const fullPages: unknown[] = [];
        for (const r of responses) {
          const fta = r?.fullTextAnnotation;
          if (fta?.text) texts.push(fta.text);
          for (const l of langHints(fta)) allLangs.add(l);
          for (const pg of fta?.pages ?? []) fullPages.push(pg);
        }
        const text = texts.join("\n\n").trim();
        if (!text) return null;
        return { text, langs: [...allLangs], confidence: meanConfidence(fullPages), pages: responses.length };
      }
      // image/*
      const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requests: [{ image: { content: b64 }, features: [{ type: "DOCUMENT_TEXT_DETECTION" }] }] }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const fta = data?.responses?.[0]?.fullTextAnnotation;
      const text = (fta?.text ?? "").trim();
      if (!text) return null;
      return { text, langs: langHints(fta), confidence: meanConfidence(fta?.pages ?? []), pages: (fta?.pages ?? []).length || 1 };
    } catch {
      return null;
    }
  },
};
