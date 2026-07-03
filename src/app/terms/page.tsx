import { MarketingShell, Prose, DraftNotice } from "@/components/marketing-shell";
import { getTranslations } from "next-intl/server";

export const metadata = { title: "Terms · Mukadma" };

export default async function TermsPage() {
  const t = await getTranslations("terms");
  return (
    <MarketingShell title={t("title")} subtitle={t("subtitle")}>
      <DraftNotice />
      <Prose>
        <h2>{t("whatHeading")}</h2>
        <p>{t("whatBody")}</p>

        <h2>{t("notAdviceHeading")}</h2>
        <p>{t.rich("notAdviceBody", { b: (c) => <strong>{c}</strong> })}</p>

        <h2>{t("directoryHeading")}</h2>
        <p>{t("directoryBody")}</p>

        <h2>{t("acceptableHeading")}</h2>
        <p>{t("acceptableBody")}</p>

        <h2>{t("subscriptionsHeading")}</h2>
        <p>
          {t.rich("subscriptionsBody", {
            pricing: (c) => <a href="/#pricing">{c}</a>,
          })}
        </p>

        <h2>{t("liabilityHeading")}</h2>
        <p>{t("liabilityBody")}</p>
      </Prose>
    </MarketingShell>
  );
}
