// Brand config — the ONE place the product name/wordmark lives, so nothing
// user-facing hardcodes it. Name = "Mukadma" (मुक़दमा = a lawsuit / case),
// founder decision 2026-07-03, replacing "Peshi" after a name collision with a
// live competitor at peshi.app. Formal IP-India TM (class 9/42/45) + domain +
// app-store clearance still pending before external launch — see WO-26 /
// tracker B5. Keep this the single source; never hardcode the name elsewhere.
export const brand = {
  /** Product name (canonical romanization = "Mukadma" per brand/NAMING.md). */
  name: "Mukadma",
  /** Devanagari lockup (मुक़दमा = a lawsuit / case). */
  nameDevanagari: "मुक़दमा",
  /** Gujarati lockup. */
  nameGujarati: "મુકદમા",
  /** One-liner; canonical copy in BRAND.md. */
  tagline: "The operating system for Indian lawyers.",
  /** Design/wordmark applied. External launch still gated on TM/domain clearance (B5). */
  isFinal: true,
} as const;

export type Brand = typeof brand;
