// i18n configuration (WO-03, Wave 1) — the supported locales for Mukadma.
// English + Hindi at launch; Gujarati is a fast-follow (fonts already loaded).
// Locale routing is NOT used (flat routes preserved — no IA change); the active
// locale is resolved per-request from a cookie, see src/lib/locale.ts.

export const locales = ["en", "hi"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}
