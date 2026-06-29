import type { OcrProvider, OcrResult } from "./types";

// Keyless default OCR: tesseract.js (wasm — no system binary needed, runs on the
// worker box). Bytes never leave our trust boundary (convention #4/#5). Indic
// `traineddata` is fetched/cached by tesseract.js on first use. Heavy + only ever
// invoked by the self-hosted worker, never in the Vercel request path — so the
// deps (tesseract.js, pdf-to-img) are imported dynamically here only.

// tesseract.js language codes: eng, hin (Hindi/Devanagari), guj (Gujarati),
// mar (Marathi), tam, tel, kan, mal, pan, ben, ori …
const DEFAULT_LANGS = (process.env.TESSERACT_LANGS ?? "eng+guj+hin").trim();

// Map tesseract codes back to the short hints we store as `langs`.
const SHORT: Record<string, string> = { eng: "en", hin: "hi", guj: "gu", mar: "mr", tam: "ta", tel: "te", kan: "kn", mal: "ml", pan: "pa", ben: "bn", ori: "or" };
const shortHints = (langSpec: string) => langSpec.split("+").map((l) => SHORT[l] ?? l);

async function rasterizePdf(buf: Buffer): Promise<Buffer[]> {
  const { pdf } = await import("pdf-to-img");
  const doc = await pdf(new Uint8Array(buf), { scale: 2 }); // ~300 DPI for legible Indic matras
  const pages: Buffer[] = [];
  const MAX_PAGES = Number(process.env.OCR_MAX_PAGES ?? "20");
  for await (const page of doc) {
    pages.push(page);
    if (pages.length >= MAX_PAGES) break;
  }
  return pages;
}

export const tesseractProvider: OcrProvider = {
  name: "tesseract",
  async ocr(buf, mime, opts): Promise<OcrResult | null> {
    const langSpec = (opts?.langs && opts.langs.length ? opts.langs : null)?.join("+") ?? DEFAULT_LANGS;
    try {
      const { createWorker } = await import("tesseract.js");
      const isPdf = mime === "application/pdf";
      const images = isPdf ? await rasterizePdf(buf) : [buf];
      if (!images.length) return null;

      const worker = await createWorker(langSpec);
      try {
        const texts: string[] = [];
        let confSum = 0;
        for (const img of images) {
          const { data } = await worker.recognize(img);
          if (data.text?.trim()) texts.push(data.text.trim());
          confSum += typeof data.confidence === "number" ? data.confidence : 0;
        }
        const text = texts.join("\n\n").trim();
        if (!text) return null;
        return { text, langs: shortHints(langSpec), confidence: Math.max(0, Math.min(1, confSum / images.length / 100)), pages: images.length };
      } finally {
        await worker.terminate();
      }
    } catch {
      return null;
    }
  },
};
