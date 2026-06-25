import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/icons";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // Must be a portal user (firm users are routed to /dashboard by middleware).
  const { data: pu } = await supabase.from("portal_user").select("client_id").eq("id", user.id).maybeSingle();
  if (!pu) redirect("/dashboard");
  const { data: client } = await supabase.from("client").select("name").eq("id", pu.client_id).maybeSingle();

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
              <Icon name="scale" className="h-5 w-5" />
            </span>
            <div className="leading-tight">
              <p className="font-serif text-lg font-medium">Legaldriver</p>
              <p className="text-xs text-ink-faint">Client portal · {client?.name ?? "your matters"}</p>
            </div>
          </div>
          <form action="/auth/signout" method="post">
            <button className="btn-ghost text-sm"><Icon name="logout" className="h-4 w-4" /> Sign out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-4xl animate-fade-in px-5 py-8">{children}</main>
    </div>
  );
}
