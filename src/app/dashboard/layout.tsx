import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/icons";
import { NavLinks } from "./nav";
import { MobileNav } from "./mobile-nav";
import { CommandPalette } from "@/components/command-palette";
import { LanguageSwitcher } from "@/components/language-switcher";
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

  const { data: tenant } = await supabase.from("tenant").select("name").single();
  const tenantName = tenant?.name ?? t("workspace");
  const initial = (user.email ?? "?").slice(0, 1).toUpperCase();

  return (
    <div className="flex min-h-screen bg-ec-paper text-ec-ink">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-ec-hair bg-ec-paper px-4 py-5 md:flex">
        <div className="flex items-center gap-2.5 px-2">
          {/* Typographic wordmark — the "date underline" motif. Name from the
              swappable brand config (working name until B1 lands). */}
          <div className="leading-tight">
            <p className="ec-underline inline-block font-display text-2xl font-semibold lowercase tracking-tight text-ec-ink">
              {brand.name}
            </p>
            <p className="mt-1.5 truncate text-xs text-ec-ink-3" title={tenantName}>{tenantName}</p>
          </div>
        </div>

        <div className="mt-7 flex-1 overflow-y-auto">
          <CommandPalette />
          <NavLinks />
        </div>

        <div className="mt-4 border-t border-ec-hair pt-4">
          <div className="mb-3 px-1"><LanguageSwitcher /></div>
          <div className="flex items-center gap-3 px-1">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ec-indigo text-sm font-semibold text-white">
              {initial}
            </span>
            <p className="min-w-0 flex-1 truncate text-xs text-ec-ink-2" title={user.email ?? ""}>
              {user.email}
            </p>
            <form action="/auth/signout" method="post">
              <button className="flex h-8 w-8 items-center justify-center rounded-ec-s text-ec-ink-3 transition hover:bg-ec-paper-3 hover:text-ec-ink" title={t("signOut")} aria-label={t("signOut")}>
                <Icon name="logout" className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <MobileNav email={user.email ?? ""} tenantName={tenantName} initial={initial} />
        <div className="mx-auto max-w-6xl animate-fade-in px-5 py-8 sm:px-8 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
