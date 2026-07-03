// Locale seam (WO-03) — resolves the active UI language per request. The cookie
// is the fast path (no DB hit in getRequestConfig); the durable source of truth
// is profile.locale (migration 0029), synced INTO the cookie at login
// (auth/callback) and on switch (setLocaleAction, src/lib/locale-actions.ts).
// Server-only (uses next/headers) — do not import in client components; the
// language-switch server action lives in locale-actions.ts for that reason.
import { cookies } from "next/headers";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "@/i18n/config";

/** Resolve the active UI locale for this request (cookie-first). */
export function getStoredLocale(): Locale {
  const cookie = cookies().get(LOCALE_COOKIE)?.value;
  return isLocale(cookie) ? cookie : defaultLocale;
}
