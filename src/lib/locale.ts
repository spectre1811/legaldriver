// Locale seam (WO-03, Wave 1) — single place that resolves and persists the
// user's UI language. Cookie-backed today. A `profile.locale` column
// (founder-gated migration, not yet applied) will later take precedence:
// when it lands, read it here first and fall back to the cookie, so no caller
// changes. Server-only (uses next/headers) — do not import in client components.
import { cookies } from "next/headers";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "@/i18n/config";

/** Resolve the active UI locale for this request. */
export function getStoredLocale(): Locale {
  const cookie = cookies().get(LOCALE_COOKIE)?.value;
  return isLocale(cookie) ? cookie : defaultLocale;
}

/** Server action: persist the user's chosen locale (cookie for now). */
export async function setLocale(locale: Locale): Promise<void> {
  "use server";
  cookies().set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
