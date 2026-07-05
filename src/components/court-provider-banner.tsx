import { getTranslations } from "next-intl/server";
import { NoticeBanner } from "@/components/court/notice-banner";
import { isMockCourtProvider } from "@/lib/court/client";

// WO-35 blocker #1 · information-integrity: when no live court provider is
// configured, add-case and refresh serve SYNTHETIC data from the mock provider.
// This banner makes that unmistakable so fabricated cases are never mistaken for
// real court records. Renders nothing when a live provider (LegalDriver) is active.
// Presentation is the shared court-kit NoticeBanner (BP-17); this keeps the app-bound
// provider guard + i18n copy.
export async function CourtProviderBanner({ className = "" }: { className?: string }) {
  if (!isMockCourtProvider()) return null;
  const t = await getTranslations("cases");
  return (
    <NoticeBanner tone="warn" title={t("demoBanner.title")} className={className}>
      {t("demoBanner.body")}
    </NoticeBanner>
  );
}
