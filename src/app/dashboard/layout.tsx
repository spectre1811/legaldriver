import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { isAllowedAdmin } from "@/lib/access/validate";
import { signAvatar } from "@/lib/profile/avatar";
import { fmtAgo } from "@/components/ui";
import { NavLinks, SidebarFooter } from "./nav";
import { MobileNav } from "./mobile-nav";
import { TopBar } from "./top-bar";
import { BrandMark } from "@/components/brand-mark";
import { brand } from "@/lib/brand";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!user.email_confirmed_at && !user.confirmed_at) {
    redirect("/login?message=Please confirm your email — check your inbox — before signing in.");
  }

  // WO-272 — founder-only admin nav link (access-request console). Gated by the
  // same ADMIN_EMAILS allowlist as the page; regular users never see it.
  const isAdmin = isAllowedAdmin(user.email, process.env.ADMIN_EMAILS);

  const { data: profile } = await supabase
    .from("profile")
    .select("full_name, designation, photo_url")
    .eq("id", user.id)
    .maybeSingle();
  const initial = (profile?.full_name ?? user.email ?? "?").slice(0, 1).toUpperCase();
  const avatarUrl = await signAvatar(profile?.photo_url);

  // WO-345 — top-bar bell dropdown's "Latest alerts" (real recent `notification` rows, i18n'd
  // here server-side since TopBar/BellMenu take plain resolved strings — see notifications/page.tsx
  // for the same kind/payload shape this reuses).
  const { data: alertRows } = await supabase
    .from("notification")
    .select("id, kind, payload, created_at")
    .order("created_at", { ascending: false })
    .limit(5);
  const tKind = await getTranslations("notifications");
  const alerts = (alertRows ?? []).map((n) => {
    const payload = (n.payload ?? {}) as { title?: string };
    return {
      id: n.id,
      label: tKind.has(`kind.${n.kind}`) ? tKind(`kind.${n.kind}`) : n.kind,
      title: payload.title ?? null,
      when: fmtAgo(n.created_at),
    };
  });

  const t = await getTranslations("shell");

  return (
    <div className="flex min-h-screen bg-ec-paper text-ec-ink">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-ec-line bg-ec-card px-4 py-5 md:flex">
        <Link
          href="/dashboard"
          aria-label={t("home")}
          className="flex items-center gap-2.5 rounded-ec-s px-2 py-1 transition hover:bg-ec-paper-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-indigo"
        >
          {/* Brand mark (letter tile) + typographic wordmark — the "date underline" motif.
              WO-345: kept the live lowercase mukadma lockup (founder trademark call) but laid it
              out like app-shell.tsx's Wordmark slot, with मुक़दमा as the subtitle line
              (previously the tenant/workspace name). */}
          <BrandMark size={32} tone="dark" className="shrink-0" />
          <div className="leading-tight">
            <p className="ec-underline inline-block font-display text-2xl font-semibold lowercase tracking-tight text-ec-ink">
              {brand.name}
            </p>
            <p className="mt-1.5 truncate text-xs text-ec-ink-3" lang="hi">{brand.nameDevanagari}</p>
          </div>
        </Link>

        <div className="mt-7 flex-1 overflow-y-auto">
          <NavLinks isAdmin={isAdmin} />
        </div>
        <SidebarFooter />
      </aside>

      <main className="min-w-0 flex-1 pb-16 md:pb-0">
        <MobileNav
          email={user.email ?? ""}
          initial={initial}
          isAdmin={isAdmin}
          fullName={profile?.full_name ?? null}
          designation={profile?.designation ?? null}
          photoUrl={avatarUrl}
        />
        <TopBar
          email={user.email ?? ""}
          initial={initial}
          fullName={profile?.full_name ?? null}
          designation={profile?.designation ?? null}
          photoUrl={avatarUrl}
          alerts={alerts}
        />
        <div className="mx-auto max-w-6xl animate-fade-in px-5 py-8 sm:px-8 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
