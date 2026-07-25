import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { isAllowedAdmin } from "@/lib/access/validate";
import { signAvatar } from "@/lib/profile/avatar";
import { NavLinks } from "./nav";
import { MobileNav } from "./mobile-nav";
import { TopBar } from "./top-bar";
import { BrandMark } from "@/components/brand-mark";
import { brand } from "@/lib/brand";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const t = await getTranslations("shell");
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

  const { data: tenant } = await supabase.from("tenant").select("name").single();
  const { data: profile } = await supabase
    .from("profile")
    .select("full_name, designation, photo_url")
    .eq("id", user.id)
    .maybeSingle();
  const tenantName = tenant?.name ?? t("workspace");
  const initial = (profile?.full_name ?? user.email ?? "?").slice(0, 1).toUpperCase();
  const avatarUrl = await signAvatar(profile?.photo_url);

  return (
    <div className="flex min-h-screen bg-ec-paper text-ec-ink">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-ec-hair bg-ec-paper px-4 py-5 md:flex">
        <Link
          href="/dashboard"
          aria-label={t("home")}
          className="flex items-center gap-2.5 rounded-ec-s px-2 py-1 transition hover:bg-ec-paper-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-indigo"
        >
          {/* Brand mark (letter tile) + typographic wordmark — the "date underline" motif. */}
          <BrandMark size={32} tone="dark" className="shrink-0" />
          <div className="leading-tight">
            <p className="ec-underline inline-block font-display text-2xl font-semibold lowercase tracking-tight text-ec-ink">
              {brand.name}
            </p>
            <p className="mt-1.5 truncate text-xs text-ec-ink-3" title={tenantName}>{tenantName}</p>
          </div>
        </Link>

        <div className="mt-7 flex-1 overflow-y-auto">
          <NavLinks isAdmin={isAdmin} />
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <MobileNav email={user.email ?? ""} tenantName={tenantName} initial={initial} isAdmin={isAdmin} />
        <TopBar
          email={user.email ?? ""}
          initial={initial}
          fullName={profile?.full_name ?? null}
          designation={profile?.designation ?? null}
          photoUrl={avatarUrl}
        />
        <div className="mx-auto max-w-6xl animate-fade-in px-5 py-8 sm:px-8 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
