import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/cases", label: "Cases" },
  { href: "/dashboard/calendar", label: "Calendar" },
  { href: "/dashboard/notices", label: "Notices" },
  { href: "/dashboard/notifications", label: "Notifications" },
  { href: "/dashboard/inbox", label: "Inbox" },
  { href: "/dashboard/documents", label: "Documents" },
  { href: "/dashboard/settings", label: "Settings" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Tenant is resolved by RLS — the user can read only their own tenant row.
  const { data: tenant } = await supabase.from("tenant").select("name").single();
  const tenantName = tenant?.name ?? "Workspace";

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col border-r border-slate-200 bg-white px-4 py-6">
        <div className="mb-6">
          <p className="text-lg font-semibold text-ink">LexDriver</p>
          <p className="truncate text-xs text-slate-400" title={tenantName}>
            {tenantName}
          </p>
        </div>
        <nav className="flex flex-col gap-1" aria-label="Main">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-accent"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <form action="/auth/signout" method="post" className="mt-auto">
          <p className="mb-2 truncate text-xs text-slate-400">{user.email}</p>
          <button className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
            Sign out
          </button>
        </form>
      </aside>
      <main className="flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
