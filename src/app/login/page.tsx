import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Icon, type IconName } from "@/components/icons";
import { BrandMark } from "@/components/brand-mark";
import { brand } from "@/lib/brand";
import { isAuthErrorCode, type AuthErrorCode } from "@/lib/auth/errors";
import { sanitizeNext, sanitizeTrack } from "@/lib/auth/redirects";
import { AuthPanel } from "./auth-panel";

// WO-339 — exact-fidelity reconcile: the Chambers prototype's trust list has a bold
// title above each line (design-mockups/iteration3/console/login.tsx's TRUST array),
// which the first pass dropped. Restored via auth.trust.{key}.title in the catalog.
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
          (design-mockups/iteration3/console/login.tsx). Renders on every width (the
          prototype's grid stacks it above the form on mobile — WO-339 exact-fidelity
          reconcile: the first pass wrongly hid this below `lg`). */}
      <section className="mk-engraved relative flex flex-col justify-between overflow-hidden bg-ec-ink px-6 py-8 text-ec-paper sm:px-10 sm:py-12">
        <Link href="/" className="relative flex items-center gap-2.5">
          <BrandMark size={30} tone="light" />
          <span className="leading-tight">
            <b className="block font-display text-xl font-medium lowercase tracking-tight text-ec-paper">{brand.name}</b>
            <span className="block text-[11px] text-ec-hair-strong">{brand.nameDevanagari}</span>
          </span>
        </Link>

        <div className="relative max-w-md py-10">
          <p className="ec-label font-mono !text-ec-honey">{t("brand.eyebrow")}</p>
          {/* h2 — the login/forgot heading below is this page's h1 (matches the
              prototype: the form heading, not the marketing plate, is primary). */}
          <h2 className="mt-3 font-display text-[30px] font-medium leading-[1.08] text-ec-paper sm:text-[38px]">
            {t("brand.headline")}
          </h2>
          <p className="mt-3 text-[13.5px] leading-relaxed text-ec-paper/70">{t("brand.sub")}</p>
          <ul className="mt-8 divide-y divide-white/10 border-y border-white/10">
            {TRUST.map(([icon, key]) => (
              <li key={key} className="flex gap-3 py-4">
                <Icon name={icon} className="mt-1 h-4 w-4 shrink-0 text-ec-honey" />
                <div className="min-w-0">
                  <div className="text-[13.5px] font-medium text-ec-paper">{t(`trust.${key}.title`)}</div>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-ec-hair-strong">{t(`trust.${key}.line`)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-ec-paper/40">{t("brand.footnote")}</p>
      </section>

      {/* Auth panel */}
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm animate-fade-in">
          <AuthPanel initialMode={mode} urlError={urlError} notice={notice} next={next} track={track} />

          <p className="mt-8 text-center text-xs text-ec-ink-3">{t("disclaimer")}</p>
        </div>
      </section>
    </main>
  );
}
