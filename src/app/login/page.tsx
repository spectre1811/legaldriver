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

          <AuthPanel initialMode={mode} urlError={urlError} notice={notice} next={next} track={track} />

          <p className="mt-8 text-center text-xs text-ec-ink-3">{t("disclaimer")}</p>
        </div>
      </section>
    </main>
  );
}
