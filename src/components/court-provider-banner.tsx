import { getTranslations } from "next-intl/server";
import { Icon } from "@/components/icons";
import { isMockCourtProvider } from "@/lib/court/client";

// WO-35 blocker #1 · information-integrity: when no live court provider is
// configured, add-case and refresh serve SYNTHETIC data from the mock provider.
// This banner makes that unmistakable so fabricated cases are never mistaken for
// real court records. Renders nothing when a live provider (LegalDriver) is active.
export async function CourtProviderBanner({ className = "" }: { className?: string }) {
  if (!isMockCourtProvider()) return null;
  const t = await getTranslations("cases");
  return (
    <div
      role="status"
      className={`flex items-start gap-2.5 rounded-ec-s border border-ec-warn/30 bg-ec-warn-t px-4 py-3 text-sm text-ec-warn ${className}`}
    >
      <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-medium">{t("demoBanner.title")}</p>
        <p className="mt-0.5 text-xs text-ec-warn/90">{t("demoBanner.body")}</p>
      </div>
    </div>
  );
}
