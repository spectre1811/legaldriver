import { getTranslations } from "next-intl/server";

import { MarketingShell, Prose } from "@/components/marketing-shell";

export const metadata = { title: "For clients · Mukadma" };

export default async function ForClientsPage() {
  const t = await getTranslations("forClients");
  return (
    <MarketingShell title={t("title")} subtitle={t("subtitle")}>
      <Prose>
        <p>{t("today")}</p>
        <h2>{t("comingNextHeading")}</h2>
        <p>
          {t.rich("comingNext", {
            email: (c) => <a href="mailto:hello@mukadma.in">{c}</a>,
          })}
        </p>
        <p>{t("portal")}</p>
      </Prose>
    </MarketingShell>
  );
}
