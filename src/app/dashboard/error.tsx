"use client";

// Error boundary for the dashboard segment (tokened, i18n-keyed). Closes the
// fourth of the four states (loading/empty/error/success).
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("common");
  return (
    <div className="ec-card flex flex-col items-center justify-center px-6 py-16 text-center">
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-ec-m bg-ec-danger-t text-ec-danger">
        <Icon name="alert" className="h-5 w-5" />
      </span>
      <h2 className="font-display text-lg font-medium text-ec-ink">{t("states.error")}</h2>
      <button onClick={reset} className="ec-btn ec-btn-ink mt-5">
        <Icon name="refresh" className="h-4 w-4" /> {t("actions.retry")}
      </button>
    </div>
  );
}
