import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { BrandMark } from "@/components/brand-mark";
import { brand } from "@/lib/brand";
import { ResetPasswordForm } from "./reset-form";

// WO-50 — the landing page of the recovery email: /auth/callback exchanged the
// recovery code for a session, so a signed-in user sets a new password here.
// No session = consumed/expired link → explicit dead-end with a way back.
export default async function ResetPasswordPage() {
  const t = await getTranslations("auth.reset");
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-screen items-center justify-center bg-ec-paper px-6">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="mb-8 flex items-center gap-2.5">
          <BrandMark size={30} tone="dark" />
          <span className="ec-underline font-display text-2xl font-semibold lowercase tracking-tight text-ec-ink">{brand.name}</span>
        </div>

        {user ? (
          <>
            <h1 className="font-display text-2xl font-medium text-ec-ink">{t("title")}</h1>
            <p className="mt-1 text-sm text-ec-ink-3">{t("subtitle")}</p>
            <ResetPasswordForm />
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl font-medium text-ec-ink">{t("expiredTitle")}</h1>
            <p className="mt-2 text-sm text-ec-ink-2">{t("expiredBody")}</p>
            <Link href="/login?mode=forgot" className="ec-btn ec-btn-ink mt-6 w-full">
              {t("requestNew")}
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
