import { MarketingShell, Prose } from "@/components/marketing-shell";
import { getTranslations } from "next-intl/server";
import { legalEffectiveDate } from "@/lib/site-config";

export const metadata = { title: "Cancellation policy · Mukadma" };

// WO-291 — Razorpay merchant activation requires a dedicated public
// cancellation policy (a UPI Autopay mandate needs a real cancellation path).
// Mirrors the /terms + /privacy layout (MarketingShell + Prose).
export default async function CancellationPage() {
  const t = await getTranslations("cancellation");
  return (
    <MarketingShell title={t("title")} subtitle={t("subtitle")} effectiveDate={legalEffectiveDate}>
      <Prose>
        <h2>{t("entityHeading")}</h2>
        <p>{t("entityBody")}</p>

        <h2>{t("howHeading")}</h2>
        <p>{t.rich("howBody", { email: (c) => <a href="mailto:yash@mukadma.in">{c}</a> })}</p>

        <h2>{t("accessHeading")}</h2>
        <p>{t.rich("accessBody", { privacy: (c) => <a href="/privacy">{c}</a> })}</p>

        <h2>{t("autopayHeading")}</h2>
        <p>{t("autopayBody")}</p>

        <h2>{t("refundsHeading")}</h2>
        <p>{t.rich("refundsBody", { refund: (c) => <a href="/refund">{c}</a> })}</p>
      </Prose>
    </MarketingShell>
  );
}
