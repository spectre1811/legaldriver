import { MarketingShell, Prose } from "@/components/marketing-shell";
import { getTranslations } from "next-intl/server";
import { legalEffectiveDate } from "@/lib/site-config";

export const metadata = { title: "Refund policy · Mukadma" };

// WO-291 — Razorpay merchant activation requires a dedicated public refund
// policy. Mirrors the /terms + /privacy layout (MarketingShell + Prose).
export default async function RefundPage() {
  const t = await getTranslations("refund");
  return (
    <MarketingShell title={t("title")} subtitle={t("subtitle")} effectiveDate={legalEffectiveDate}>
      <Prose>
        <h2>{t("entityHeading")}</h2>
        <p>{t.rich("entityBody", { email: (c) => <a href="mailto:yash@mukadma.in">{c}</a> })}</p>

        <h2>{t("subscriptionsHeading")}</h2>
        <p>
          {t.rich("subscriptionsBody", {
            pricing: (c) => <a href="/#pricing">{c}</a>,
            terms: (c) => <a href="/terms">{c}</a>,
          })}
        </p>

        <h2>{t("creditsHeading")}</h2>
        <p>{t("creditsBody")}</p>

        <h2>{t("autopayHeading")}</h2>
        <p>{t("autopayBody")}</p>

        <h2>{t("howHeading")}</h2>
        <p>{t.rich("howBody", { email: (c) => <a href="mailto:yash@mukadma.in">{c}</a> })}</p>
      </Prose>
    </MarketingShell>
  );
}
