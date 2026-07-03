import { getTranslations } from "next-intl/server";

import { MarketingShell, Prose } from "@/components/marketing-shell";

export const metadata = { title: "Contact · Peshi" };

export default async function ContactPage() {
  const t = await getTranslations("contact");
  return (
    <MarketingShell title={t("title")} subtitle={t("subtitle")}>
      <Prose>
        <ul>
          <li>
            {t.rich("support", {
              b: (c) => <strong>{c}</strong>,
              mail: (c) => <a href="mailto:hello@peshi.app">{c}</a>,
            })}
          </li>
          <li>
            {t.rich("grievances", {
              b: (c) => <strong>{c}</strong>,
              mail: (c) => <a href="mailto:grievance@peshi.app">{c}</a>,
              corrections: (c) => <a href="/data-corrections">{c}</a>,
            })}
          </li>
          <li>
            {t.rich("member", {
              b: (c) => <strong>{c}</strong>,
            })}
          </li>
        </ul>
        <p>
          {t.rich("advocate", {
            login: (c) => <a href="/login">{c}</a>,
          })}
        </p>
      </Prose>
    </MarketingShell>
  );
}
