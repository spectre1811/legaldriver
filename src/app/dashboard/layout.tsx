import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { isAllowedAdmin } from "@/lib/access/validate";
import { signAvatar } from "@/lib/profile/avatar";
import { fmtAgo } from "@/components/ui";
import { Sidebar } from "./nav";
import { MobileNav } from "./mobile-nav";
import { TopBar } from "./top-bar";
import { ToastProvider } from "@/components/toast";

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
    // WO-405 C2 — the app's ONE toast system, mounted once here so every dashboard client
    // component can call useToast() (@/components/toast). See ToastProvider's file comment.
    <ToastProvider>
      <div className="flex min-h-screen bg-ec-paper text-ec-ink">
        {/* WO-406 D4 — collapsible & resizable sidebar; the logo/nav/footer composition that
            used to be inline here now lives in the client-side Sidebar (needs hooks for
            collapse/resize/persistence, which a server component can't hold). `shrink-0` +
            <main>'s `flex-1` is what makes the content area reflow to whatever width Sidebar
            renders — no coordination needed on this side. */}
        <Sidebar isAdmin={isAdmin} homeLabel={t("home")} />

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
    </ToastProvider>
  );
}
