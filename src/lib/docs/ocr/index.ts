import type { OcrProvider, OcrResult, OcrProvenance } from "./types";
import { tesseractProvider } from "./tesseract";
import { googleVisionProvider } from "./google-vision";
import { suryaProvider } from "./surya";

// Env-routed OCR, mirroring the LLM router (`complete.ts`). All keyless/on-box by
// default — no per-page cloud cost, bytes stay on our box:
//   OCR_PROVIDER      tesseract | surya | google | auto   (default: auto)
//   OCR_FALLBACK      tesseract | surya | google | none   (default: smart)
//   OCR_MIN_CONFIDENCE  escalate to fallback below this    (default: 0.6)
// `auto` prefers the best provider actually available on-box: Surya if its CLI is
// configured (SURYA_OCR_CMD), else keyless Tesseract; it escalates to the fallback
// only when the primary returns null or low confidence, keeping the better result.
// Google Vision is opt-in (GOOGLE_VISION_API_KEY) — a convenience tier, not required.

export type { OcrResult, OcrProvenance } from "./types";

const PROVIDERS: Record<string, OcrProvider> = {
  tesseract: tesseractProvider,
  surya: suryaProvider,
  google: googleVisionProvider,
};

const MIN_CONFIDENCE = Number(process.env.OCR_MIN_CONFIDENCE ?? "0.6");
const suryaConfigured = () => !!process.env.SURYA_OCR_CMD;
const visionConfigured = () => !!process.env.GOOGLE_VISION_API_KEY;

function primaryName(): string {
  const p = (process.env.OCR_PROVIDER ?? "auto").toLowerCase();
  if (p === "google" || p === "surya" || p === "tesseract") return p;
  // auto: best on-box provider available
  return suryaConfigured() ? "surya" : "tesseract";
}
function fallbackName(primary: string): string | null {
  const f = (process.env.OCR_FALLBACK ?? "").toLowerCase();
  if (f === "none") return null;
  if (f === "tesseract" || f === "surya" || f === "google") return f === primary ? null : f;
  // smart default: prefer another on-box engine, else Vision if a key exists.
  if (primary !== "surya" && suryaConfigured()) return "surya";
  if (primary !== "tesseract") return "tesseract";
  if (visionConfigured()) return "google";
  return null;
}

export function ocrEnabled(): boolean {
  return true; // tesseract (keyless wasm) is always available
}

export interface OcrOutcome extends OcrResult { provider: string }

export async function ocr(buf: Buffer, mime: string, opts?: { langs?: string[] }): Promise<OcrOutcome | null> {
  const auto = (process.env.OCR_PROVIDER ?? "auto").toLowerCase() === "auto";
  const primary = primaryName();
  const first = await PROVIDERS[primary].ocr(buf, mime, opts);

  const fb = fallbackName(primary);
  const shouldEscalate = (auto || !first) && fb && (!first || first.confidence < MIN_CONFIDENCE);
  if (shouldEscalate && fb) {
    const second = await PROVIDERS[fb].ocr(buf, mime, opts);
    if (second && (!first || second.confidence >= first.confidence)) return { ...second, provider: fb };
  }
  return first ? { ...first, provider: primary } : null;
}

export function ocrProvenance(o: OcrOutcome, at: string): OcrProvenance {
  return { provider: o.provider, langs: o.langs, confidence: o.confidence, pages: o.pages, at };
}
