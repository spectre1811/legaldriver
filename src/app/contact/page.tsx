import { getTranslations } from "next-intl/server";

import { MarketingShell, Prose } from "@/components/marketing-shell";

export const metadata = { title: "Contact · Mukadma" };

export default async function ContactPage() {
  const t = await getTranslations("contact");
  return (
    <MarketingShell title={t("title")} subtitle={t("subtitle")}>
      <Prose>
        <ul>
          <li>
            {t.rich("support", {
              b: (c) => <strong>{c}</strong>,
              mail: (c) => <a href="mailto:yash@mukadma.in">{c}</a>,
            })}
          </li>
          <li>
            {t.rich("grievances", {
              b: (c) => <strong>{c}</strong>,
              mail: (c) => <a href="mailto:yash@mukadma.in">{c}</a>,
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
