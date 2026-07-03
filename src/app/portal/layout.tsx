import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/icons";
import { brand } from "@/lib/brand";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const t = await getTranslations("portal");
  const ts = await getTranslations("shell");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // Must be a portal user (firm users are routed to /dashboard by middleware).
  const { data: pu } = await supabase.from("portal_user").select("client_id").eq("id", user.id).maybeSingle();
  if (!pu) redirect("/dashboard");
  const { data: client } = await supabase.from("client").select("name").eq("id", pu.client_id).maybeSingle();

  return (
    <div className="min-h-screen bg-ec-paper text-ec-ink">
      <header className="border-b border-ec-hair bg-ec-paper">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <div className="leading-tight">
            <p className="ec-underline inline-block font-display text-xl font-semibold lowercase tracking-tight text-ec-ink">{brand.name}</p>
            <p className="mt-1 text-xs text-ec-ink-3">{t("headerLabel")} · {client?.name ?? t("yourMatters")}</p>
          </div>
          <form action="/auth/signout" method="post">
            <button className="ec-btn ec-btn-ghost text-sm"><Icon name="logout" className="h-4 w-4" /> {ts("signOut")}</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-4xl animate-fade-in px-5 py-8">{children}</main>
    </div>
  );
}
