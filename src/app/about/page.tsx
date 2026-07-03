import { MarketingShell, Prose } from "@/components/marketing-shell";
import { getTranslations } from "next-intl/server";

export const metadata = { title: "About · Mukadma" };

export default async function AboutPage() {
  const t = await getTranslations("about");
  return (
    <MarketingShell title={t("title")} subtitle={t("subtitle")}>
      <Prose>
        <p>{t("intro")}</p>
        <h2>{t("whyHeading")}</h2>
        <p>{t("whyBody")}</p>
        <h2>{t("howHeading")}</h2>
        <ul>
          <li>{t.rich("trust", { b: (c) => <strong>{c}</strong> })}</li>
          <li>{t.rich("lawyerFirst", { b: (c) => <strong>{c}</strong> })}</li>
          <li>{t.rich("bilingual", { b: (c) => <strong>{c}</strong> })}</li>
        </ul>
      </Prose>
    </MarketingShell>
  );
}
