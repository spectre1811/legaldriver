import { getTranslations } from "next-intl/server";

import { MarketingShell, Prose } from "@/components/marketing-shell";

export const metadata = { title: "Why Peshi · Peshi" };

export default async function WhyUsPage() {
  const t = await getTranslations("whyUs");
  return (
    <MarketingShell title={t("title")} subtitle={t("subtitle")}>
      <Prose>
        <ul>
          <li>{t.rich("item1", { b: (c) => <strong>{c}</strong> })}</li>
          <li>{t.rich("item2", { b: (c) => <strong>{c}</strong> })}</li>
          <li>{t.rich("item3", { b: (c) => <strong>{c}</strong> })}</li>
          <li>{t.rich("item4", { b: (c) => <strong>{c}</strong> })}</li>
          <li>{t.rich("item5", { b: (c) => <strong>{c}</strong> })}</li>
        </ul>
      </Prose>
    </MarketingShell>
  );
}
