// Brand config (WO-03) — the ONE place the product name/wordmark lives, so
// nothing user-facing hardcodes it. The name is founder decision B1 (pending
// trademark); "Peshi" is a provisional working name. Wave 4 flips `isFinal`
// and locks the wordmark once B1 lands. See plan/brand/BRAND.md.
export const brand = {
  /** Working name — provisional, pending trademark (tracker B1). */
  name: "Peshi",
  /** Devanagari lockup of the working name (पेशी = a hearing / one's court date). */
  nameDevanagari: "पेशी",
  /** One-liner; canonical copy in BRAND.md. */
  tagline: "The operating system for Indian lawyers.",
  /** False until the name + wordmark are locked (drives the Wave-4 swap). */
  isFinal: false,
} as const;

export type Brand = typeof brand;
