// Deterministic, keyless language/script detection over Unicode blocks. Used to
// tag extracted text (digital or OCR'd) with the dominant Indic script(s) so the
// drafting layer can choose template language and an English/vernacular toggle.
// This is a script detector, not a full language classifier (it cannot split
// Hindi vs Marathi — both Devanagari); it returns the script-implied hints.

const BLOCKS: { lang: string; re: RegExp }[] = [
  { lang: "hi", re: /[ऀ-ॿ]/g }, // Devanagari (Hindi/Marathi)
  { lang: "gu", re: /[઀-૿]/g }, // Gujarati
  { lang: "pa", re: /[਀-੿]/g }, // Gurmukhi (Punjabi)
  { lang: "bn", re: /[ঀ-৿]/g }, // Bengali
  { lang: "ta", re: /[஀-௿]/g }, // Tamil
  { lang: "te", re: /[ఀ-౿]/g }, // Telugu
  { lang: "kn", re: /[ಀ-೿]/g }, // Kannada
  { lang: "ml", re: /[ഀ-ൿ]/g }, // Malayalam
  { lang: "or", re: /[଀-୿]/g }, // Odia
  { lang: "en", re: /[A-Za-z]/g },
];

// Returns dominant scripts (any contributing >=15% of detected glyphs), most-used
// first. Empty array if there's no meaningful text.
export function detectLangs(text: string): string[] {
  if (!text || text.trim().length < 4) return [];
  const counts = BLOCKS.map((b) => ({ lang: b.lang, n: (text.match(b.re) ?? []).length }));
  const total = counts.reduce((a, c) => a + c.n, 0);
  if (total === 0) return [];
  return counts
    .filter((c) => c.n / total >= 0.15)
    .sort((a, b) => b.n - a.n)
    .map((c) => c.lang);
}

export function isMixedScript(text: string): boolean {
  return detectLangs(text).length > 1;
}
