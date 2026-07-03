// Brand config (WO-03) — the ONE place the product name/wordmark lives, so
// nothing user-facing hardcodes it. Name locked to "Peshi" by founder decision
// B1 (2026-07-03); TM search still advisable before external launch. See
// plan/brand/BRAND.md.
export const brand = {
  /** Product name — locked (tracker B1, 2026-07-03). */
  name: "Peshi",
  /** Devanagari lockup (पेशी = a hearing / one's court date). */
  nameDevanagari: "पेशी",
  /** One-liner; canonical copy in BRAND.md. */
  tagline: "The operating system for Indian lawyers.",
  /** Name is decided — Wave 4 (landing + full brand application) is unblocked. */
  isFinal: true,
} as const;

export type Brand = typeof brand;
