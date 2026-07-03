"use client";

// Compact EN / हिन्दी toggle. Client component (uses the useLocale hook) so it
// can sit in both server layouts and the client mobile drawer; posts to the
// setLocaleAction server action (cookie + profile.locale). WO-03.
import { useLocale, useTranslations } from "next-intl";
import { setLocaleAction } from "@/lib/locale-actions";
import { locales } from "@/i18n/config";

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const current = useLocale();
  const t = useTranslations("common.language");
  return (
    <form action={setLocaleAction} aria-label={t("label")} className={`inline-flex overflow-hidden rounded-ec-s border border-ec-hair ${className}`}>
      {locales.map((loc) => (
        <button
          key={loc}
          name="locale"
          value={loc}
          aria-pressed={current === loc}
          className={`px-2 py-1 text-xs font-medium transition ${
            current === loc ? "bg-ec-ink text-ec-paper" : "text-ec-ink-3 hover:bg-ec-paper-3 hover:text-ec-ink"
          }`}
        >
          {t(loc)}
        </button>
      ))}
    </form>
  );
}
