import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BrandMark } from "@/components/brand-mark";
import { brand } from "@/lib/brand";
import { sanitizeNext } from "@/lib/auth/redirects";

// WO-50 — visible landing for /auth/callback failures (code exchange, provider
// refusal, malformed link) with an explicit retry that keeps the deep-link
// intent. Replaces the old silent bounce to /login.
export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: { reason?: string; next?: string };
}) {
  const t = await getTranslations("auth.callbackError");
  const reason = ["provider", "missing", "exchange"].includes(searchParams.reason ?? "")
    ? (searchParams.reason as "provider" | "missing" | "exchange")
    : "exchange";
  const next = sanitizeNext(searchParams.next);
  const retryHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";

  return (
    <main className="flex min-h-screen items-center justify-center bg-ec-paper px-6">
      <div className="w-full max-w-sm animate-fade-in text-center">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <BrandMark size={30} tone="dark" />
          <span className="ec-underline font-display text-2xl font-semibold lowercase tracking-tight text-ec-ink">{brand.name}</span>
        </div>
        <h1 className="font-display text-2xl font-medium text-ec-ink">{t("title")}</h1>
        <p role="alert" className="mt-3 rounded-ec-s bg-ec-danger-t px-3.5 py-2.5 text-sm text-ec-danger">
          {t(reason)}
        </p>
        <Link href={retryHref} className="ec-btn ec-btn-ink mt-6 w-full">
          {t("retry")}
        </Link>
        <p className="mt-4 text-xs text-ec-ink-3">{t("hint")}</p>
      </div>
    </main>
  );
}
