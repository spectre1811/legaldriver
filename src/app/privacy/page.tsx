import { MarketingShell, Prose } from "@/components/marketing-shell";
import { getTranslations } from "next-intl/server";
import { legalEffectiveDate } from "@/lib/site-config";

export const metadata = { title: "Privacy · Mukadma" };

export default async function PrivacyPage() {
  const t = await getTranslations("privacy");
  return (
    <MarketingShell title={t("title")} subtitle={t("subtitle")} effectiveDate={legalEffectiveDate}>
      <Prose>
        <h2>{t("twoKindsHeading")}</h2>
        <ul>
          <li>
            {t.rich("yourDataItem", { b: (c) => <strong>{c}</strong> })}
          </li>
          <li>
            {t.rich("courtRecordsItem", { b: (c) => <strong>{c}</strong> })}
          </li>
        </ul>

        <h2>{t("collectHeading")}</h2>
        <p>{t("collectBody")}</p>

        <h2>{t("rightsHeading")}</h2>
        <p>
          {t.rich("rightsBody", {
            corrections: (c) => <a href="/data-corrections">{c}</a>,
            email: (c) => <a href="mailto:yash@mukadma.in">{c}</a>,
          })}
        </p>

        <h2>{t("securityHeading")}</h2>
        <p>{t("securityBody")}</p>

        <h2>{t("aiHeading")}</h2>
        <p>{t("aiBody")}</p>
      </Prose>
    </MarketingShell>
  );
}
