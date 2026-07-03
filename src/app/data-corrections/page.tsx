import { MarketingShell, Prose, DraftNotice } from "@/components/marketing-shell";
import { getTranslations } from "next-intl/server";

export const metadata = { title: "Data corrections & takedowns · Mukadma" };

// Compliance-critical: the correction/takedown workflow (07-COMPLIANCE §3).
export default async function DataCorrectionsPage() {
  const t = await getTranslations("dataCorrections");
  return (
    <MarketingShell
      title={t("title")}
      subtitle={t("subtitle")}
    >
      <DraftNotice />
      <Prose>
        <h2>{t("whatYouCanRequest.heading")}</h2>
        <ul>
          <li>{t.rich("whatYouCanRequest.correction", { b: (c) => <strong>{c}</strong> })}</li>
          <li>{t.rich("whatYouCanRequest.takedown", { b: (c) => <strong>{c}</strong> })}</li>
        </ul>

        <h2>{t("howToRaise.heading")}</h2>
        <p>{t.rich("howToRaise.body", { email: (c) => <a href="mailto:grievance@mukadma.in">{c}</a> })}</p>

        <h2>{t("whatHappensNext.heading")}</h2>
        <ul>
          <li>{t.rich("whatHappensNext.acknowledgement", { b: (c) => <strong>{c}</strong> })}</li>
          <li>{t.rich("whatHappensNext.action", { b: (c) => <strong>{c}</strong> })}</li>
          <li>{t.rich("whatHappensNext.resolution", { b: (c) => <strong>{c}</strong> })}</li>
        </ul>

        <h2>{t("howWeAct.heading")}</h2>
        <p>{t.rich("howWeAct.body", { b: (c) => <strong>{c}</strong> })}</p>

        <h2>{t("grievanceOfficer.heading")}</h2>
        <p>{t.rich("grievanceOfficer.body", { email: (c) => <a href="mailto:grievance@mukadma.in">{c}</a> })}</p>
      </Prose>
    </MarketingShell>
  );
}
