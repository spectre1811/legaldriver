import type { OcrProvider, OcrResult, OcrProvenance } from "./types";
import { tesseractProvider } from "./tesseract";
import { googleVisionProvider } from "./google-vision";

// Env-routed OCR, mirroring the LLM router (`complete.ts`):
//   OCR_PROVIDER      tesseract | google | auto   (default: auto)
//   OCR_FALLBACK      google | tesseract | none   (default: google)
//   OCR_MIN_CONFIDENCE  escalate to fallback below this (default: 0.6)
// `auto` = run the primary, and if it returns null or low confidence and a
// (different, configured) fallback exists, run that and keep the higher-confidence
// result. Default OCR is on-box (tesseract) so PII stays local; Vision is only used
// when GOOGLE_VISION_API_KEY is set.

export type { OcrResult, OcrProvenance } from "./types";

const PROVIDERS: Record<string, OcrProvider> = {
  tesseract: tesseractProvider,
  google: googleVisionProvider,
};

const MIN_CONFIDENCE = Number(process.env.OCR_MIN_CONFIDENCE ?? "0.6");

function primaryName(): string {
  const p = (process.env.OCR_PROVIDER ?? "auto").toLowerCase();
  if (p === "google") return "google";
  return "tesseract"; // tesseract for both "tesseract" and "auto"
}
function fallbackName(primary: string): string | null {
  const f = (process.env.OCR_FALLBACK ?? "google").toLowerCase();
  if (f === "none" || f === primary) return null;
  return PROVIDERS[f] ? f : null;
}

export function ocrEnabled(): boolean {
  // tesseract is always available (keyless wasm); google needs a key.
  return primaryName() === "tesseract" || !!process.env.GOOGLE_VISION_API_KEY;
}

export interface OcrOutcome extends OcrResult { provider: string }

export async function ocr(buf: Buffer, mime: string, opts?: { langs?: string[] }): Promise<OcrOutcome | null> {
  const auto = (process.env.OCR_PROVIDER ?? "auto").toLowerCase() === "auto";
  const primary = primaryName();
  const first = await PROVIDERS[primary].ocr(buf, mime, opts);

  const fb = fallbackName(primary);
  const shouldEscalate = auto && fb && (!first || first.confidence < MIN_CONFIDENCE);
  if (shouldEscalate && fb) {
    const second = await PROVIDERS[fb].ocr(buf, mime, opts);
    if (second && (!first || second.confidence >= first.confidence)) return { ...second, provider: fb };
  }
  return first ? { ...first, provider: primary } : null;
}

export function ocrProvenance(o: OcrOutcome, at: string): OcrProvenance {
  return { provider: o.provider, langs: o.langs, confidence: o.confidence, pages: o.pages, at };
}
