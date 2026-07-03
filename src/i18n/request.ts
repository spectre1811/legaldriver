// next-intl request config (WO-03, Wave 1). No i18n routing: the locale comes
// from the cookie seam (src/lib/locale.ts), so flat App-Router routes are
// untouched. Message catalogs live in ./messages/<locale>.json.
import { getRequestConfig } from "next-intl/server";
import { getStoredLocale } from "@/lib/locale";

export default getRequestConfig(async () => {
  const locale = getStoredLocale();
  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
