import type { OcrProvider, OcrResult } from "./types";

// Keyless default OCR: tesseract.js (wasm — no system binary, runs on the worker
// box). Bytes never leave our trust boundary (convention #4/#5). Made "proper" for
// real scanned Indic documents — at zero per-page cost — by two free levers:
//   1. image preprocessing (sharp): grayscale → upscale small scans to ~300 DPI →
//      contrast-normalise → denoise → sharpen. Biggest accuracy win on real scans.
//   2. tessdata_best (LSTM) models instead of tessdata_fast — markedly better on
//      Devanagari/Gujarati matras & half-forms. Bigger/slower but quality-first.
// Heavy + only ever invoked by the self-hosted worker, never in the Vercel request
// path — so deps (tesseract.js, pdf-to-img, sharp) are imported dynamically here.

// tesseract.js language codes: eng, hin (Hindi/Devanagari), guj (Gujarati),
// mar (Marathi), tam, tel, kan, mal, pan, ben, ori …
const DEFAULT_LANGS = (process.env.TESSERACT_LANGS ?? "eng+guj+hin").trim();
// "best" = tessdata_best (accurate, default) · "fast" = tessdata_fast (smaller/quicker).
const DATA = (process.env.TESSERACT_DATA ?? "best").toLowerCase() === "fast" ? "4.0.0_fast" : "4.0.0_best";
const LANG_PATH = process.env.TESSERACT_LANG_PATH ?? `https://tessdata.projectnaptha.com/${DATA}`;

const SHORT: Record<string, string> = { eng: "en", hin: "hi", guj: "gu", mar: "mr", tam: "ta", tel: "te", kan: "kn", mal: "ml", pan: "pa", ben: "bn", ori: "or" };
const shortHints = (langSpec: string) => langSpec.split("+").map((l) => SHORT[l] ?? l);

// Preprocess a raster image for OCR. Conservative (no hard global threshold — that
// destroys Indic matras under uneven lighting; let Tesseract's Otsu binarise).
async function preprocess(img: Buffer): Promise<Buffer> {
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(img).metadata();
    const w = meta.width ?? 0;
    let pipe = sharp(img).grayscale();
    // Upscale low-res scans so small Indic glyphs survive (~300 DPI ≈ 2000px wide A4).
    if (w && w < 1800) pipe = pipe.resize({ width: Math.min(2400, Math.round(w * (1800 / w))), withoutEnlargement: false });
    pipe = pipe.normalize().median(1).sharpen();
    return await pipe.png().toBuffer();
  } catch {
    return img; // preprocessing is best-effort; fall back to the raw image
  }
}

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
      const rawImages = isPdf ? await rasterizePdf(buf) : [buf];
      if (!rawImages.length) return null;
      const images = await Promise.all(rawImages.map(preprocess));

      const worker = await createWorker(langSpec, undefined, { langPath: LANG_PATH });
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
