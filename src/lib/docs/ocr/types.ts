// OCR provider seam — same philosophy as the LLM layer (`src/lib/ai/complete.ts`):
// a small interface, env-routed, with a keyless default and a key-gated quality
// fallback (convention #7). Providers return text + detected languages + a
// confidence so the router can decide whether to escalate to a stronger provider.

export interface OcrResult {
  text: string;
  langs: string[];        // ISO-ish hints, e.g. ["en","gu"]
  confidence: number;     // 0..1 (mean word/page confidence)
  pages?: number;
}

export interface OcrProvider {
  name: string;
  // Returns null on any failure (unavailable binary/model, network, bad input) —
  // the router treats null as "this provider couldn't do it" and falls through.
  ocr(buf: Buffer, mime: string, opts?: { langs?: string[] }): Promise<OcrResult | null>;
}

// Persisted to document.extracted.ocr for provenance (convention #3).
export interface OcrProvenance {
  provider: string;
  langs: string[];
  confidence: number;
  pages?: number;
  at: string;
}
