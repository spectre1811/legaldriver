import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/icons";
import { NavLinks } from "./nav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!user.email_confirmed_at && !user.confirmed_at) {
    redirect("/login?message=Please confirm your email — check your inbox — before signing in.");
  }

  const { data: tenant } = await supabase.from("tenant").select("name").single();
  const tenantName = tenant?.name ?? "Workspace";
  const initial = (user.email ?? "?").slice(0, 1).toUpperCase();

  return (
    <div className="flex min-h-screen bg-paper">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-surface px-4 py-5 md:flex">
        <div className="flex items-center gap-2.5 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
            <Icon name="scale" className="h-5 w-5" />
          </span>
          <div className="leading-tight">
            <p className="font-serif text-lg font-medium">Legaldriver</p>
            <p className="truncate text-xs text-ink-faint" title={tenantName}>{tenantName}</p>
          </div>
        </div>

        <div className="mt-7 flex-1 overflow-y-auto">
          <NavLinks />
        </div>

        <div className="mt-4 border-t border-line pt-4">
          <div className="flex items-center gap-3 px-1">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
              {initial}
            </span>
            <p className="min-w-0 flex-1 truncate text-xs text-ink-muted" title={user.email ?? ""}>
              {user.email}
            </p>
            <form action="/auth/signout" method="post">
              <button className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-faint transition hover:bg-paper hover:text-ink" title="Sign out" aria-label="Sign out">
                <Icon name="logout" className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl animate-fade-in px-5 py-8 sm:px-8 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
