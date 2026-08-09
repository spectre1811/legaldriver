import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Icon, type IconName } from "@/components/icons";
import { BrandMark } from "@/components/brand-mark";
import { brand } from "@/lib/brand";
import { isAuthErrorCode, type AuthErrorCode } from "@/lib/auth/errors";
import { sanitizeNext, sanitizeTrack } from "@/lib/auth/redirects";
import { AuthPanel } from "./auth-panel";

const TRUST: [IconName, string][] = [
  ["cases", "cases"],
  ["gmail", "inbox"],
  ["notices", "notices"],
];

// WO-50 — method-first auth, two explicit modes. Deep-link params:
//   ?mode=signup|forgot  ?next=/path  ?track=<CNR>  ?error=<code>
//   ?notice=confirmEmail|passwordChanged
// WO-339 — Daybreak/Chambers reskin (restyle only — see
// design-mockups/iteration3/console/login.tsx). Every searchParams/redirect
// branch below is untouched; only the JSX/classNames changed.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: { mode?: string; error?: string; notice?: string; next?: string; track?: string };
}) {
  const t = await getTranslations("auth");

  // WO-272 invite-only: there is no signup mode. A legacy/deep ?mode=signup link
  // lands on sign-in with the invite-only notice (which routes to /request-access).
  const wantsSignup = searchParams.mode === "signup";
  const mode = searchParams.mode === "forgot" ? "forgot" : "signin";
  // Only known codes render translated copy; anything else (incl. legacy raw
  // messages in old links) collapses to the generic error.
  const urlError: AuthErrorCode | undefined = searchParams.error
    ? isAuthErrorCode(searchParams.error)
      ? searchParams.error
      : "unknown"
    : undefined;
  // WO-316 — ?notice=passwordChanged is set by the password-update action, which
  // globally revokes every session (this one included) and lands here.
  const notice =
    searchParams.notice === "confirmEmail"
      ? ("confirmEmail" as const)
      : searchParams.notice === "passwordChanged"
        ? ("passwordChanged" as const)
        : wantsSignup
          ? ("inviteOnly" as const)
          : undefined;
  const next = sanitizeNext(searchParams.next) ?? undefined;
  const track = sanitizeTrack(searchParams.track) ?? undefined;

  return (
    <main className="grid min-h-screen bg-ec-paper lg:grid-cols-2">
      {/* Brand plate — engraved ink plate, honey eyebrow + a divided trust list
          (design-mockups/iteration3/console/login.tsx). */}
      <section className="mk-engraved relative hidden flex-col justify-between overflow-hidden bg-ec-ink px-10 py-12 text-ec-paper lg:flex">
        <Link href="/" className="relative flex items-center gap-2.5">
          <BrandMark size={30} tone="light" />
          <span className="leading-tight">
            <b className="block font-display text-xl font-medium lowercase tracking-tight text-ec-paper">{brand.name}</b>
            <span className="block text-[11px] text-ec-hair-strong">{brand.nameDevanagari}</span>
          </span>
        </Link>

        <div className="relative max-w-md py-10">
          <p className="ec-label font-mono !text-ec-honey">{t("brand.eyebrow")}</p>
          <h1 className="mt-3 font-display text-[30px] font-medium leading-[1.08] text-ec-paper sm:text-[38px]">
            {t("brand.headline")}
          </h1>
          <p className="mt-3 text-[13.5px] leading-relaxed text-ec-paper/70">{t("brand.sub")}</p>
          <ul className="mt-8 divide-y divide-white/10 border-y border-white/10">
            {TRUST.map(([icon, key]) => (
              <li key={key} className="flex gap-3 py-4">
                <Icon name={icon} className="mt-1 h-4 w-4 shrink-0 text-ec-honey" />
                <p className="min-w-0 text-[13px] leading-snug text-ec-hair-strong">{t(`trust.${key}`)}</p>
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
            <span className="leading-tight">
              <b className="block font-display text-xl font-medium lowercase tracking-tight text-ec-ink">{brand.name}</b>
              <span className="block text-[11px] text-ec-ink-3">{brand.nameDevanagari}</span>
            </span>
          </div>

          <AuthPanel initialMode={mode} urlError={urlError} notice={notice} next={next} track={track} />

          <p className="mt-8 text-center text-xs text-ec-ink-3">{t("disclaimer")}</p>
        </div>
      </section>
    </main>
  );
}
