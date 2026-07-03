import { getTranslations } from "next-intl/server";
import { signIn, signUp } from "./actions";
import { Icon, type IconName } from "@/components/icons";
import { BrandMark } from "@/components/brand-mark";
import { brand } from "@/lib/brand";

const TRUST: [IconName, string][] = [
  ["cases", "cases"],
  ["gmail", "inbox"],
  ["notices", "notices"],
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; message?: string };
}) {
  const t = await getTranslations("auth");
  return (
    <main className="grid min-h-screen bg-ec-paper lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel — ink plate, one line of brass. No gradients. */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-ec-ink p-12 text-ec-paper lg:flex">
        <div className="relative flex items-center gap-2.5">
          <BrandMark size={30} tone="light" />
          <span className="ec-underline font-display text-2xl font-semibold lowercase tracking-tight text-ec-paper">{brand.name}</span>
        </div>

        <div className="relative max-w-md">
          <p lang="gu" className="mb-3 font-display text-7xl font-medium leading-none text-ec-paper/10">{brand.nameGujarati}</p>
          <h1 className="font-display text-4xl font-medium leading-[1.15] text-ec-paper">{t("brand.headline")}</h1>
          <p className="mt-4 text-ec-paper/70">{t("brand.sub")}</p>
          <ul className="mt-8 space-y-3">
            {TRUST.map(([icon, key]) => (
              <li key={key} className="flex items-center gap-3 text-sm text-ec-paper/85">
                <span className="flex h-8 w-8 items-center justify-center rounded-ec-s bg-ec-paper/10 text-ec-brass">
                  <Icon name={icon} className="h-4 w-4" />
                </span>
                {t(`trust.${key}`)}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-ec-paper/40">{t("brand.footnote")}</p>
      </section>

      {/* Auth panel */}
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <BrandMark size={30} tone="dark" />
            <span className="ec-underline font-display text-2xl font-semibold lowercase tracking-tight text-ec-ink">{brand.name}</span>
          </div>

          <h2 className="font-display text-2xl font-medium text-ec-ink">{t("welcome")}</h2>
          <p className="mt-1 text-sm text-ec-ink-3">{t("subtitle")}</p>

          {searchParams.error && (
            <p role="alert" className="mt-5 rounded-ec-s bg-ec-danger-t px-3.5 py-2.5 text-sm text-ec-danger">
              {searchParams.error}
            </p>
          )}
          {searchParams.message && (
            <p className="mt-5 rounded-ec-s bg-ec-brass-tint px-3.5 py-2.5 text-sm text-ec-brass-deep">
              {searchParams.message}
            </p>
          )}

          <form className="mt-6 space-y-4">
            <div>
              <label className="ec-label" htmlFor="full_name">{t("fullName")} <span className="font-normal normal-case text-ec-ink-3">{t("fullNameHint")}</span></label>
              <input id="full_name" name="full_name" autoComplete="name" className="input mt-1.5" placeholder={t("ph.fullName")} />
            </div>
            <div>
              <label className="ec-label" htmlFor="email">{t("email")}</label>
              <input id="email" name="email" type="email" required autoComplete="email" className="input mt-1.5" placeholder={t("ph.email")} />
            </div>
            <div>
              <label className="ec-label" htmlFor="password">{t("password")}</label>
              <input id="password" name="password" type="password" required minLength={6} autoComplete="current-password" className="input mt-1.5" placeholder="••••••••" />
            </div>

            <div className="flex flex-col gap-2.5 pt-1">
              <button formAction={signIn} className="ec-btn ec-btn-ink w-full">{t("signIn")}</button>
              <button formAction={signUp} className="ec-btn ec-btn-ghost w-full">{t("createWorkspace")}</button>
            </div>
          </form>

          <p className="mt-8 text-center text-xs text-ec-ink-3">{t("disclaimer")}</p>
        </div>
      </section>
    </main>
  );
}
