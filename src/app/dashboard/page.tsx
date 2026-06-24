import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Stat, Card, Disclaimer, Badge, fmtDate } from "@/components/ui";
import { Icon } from "@/components/icons";

export default async function OverviewPage() {
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [matters, hearings, deadlines, notices, review, upcoming] = await Promise.all([
    supabase.from("matter").select("*", { count: "exact", head: true }),
    supabase.from("hearing").select("*", { count: "exact", head: true }).gte("date", today),
    supabase.from("deadline").select("*", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("notice").select("*", { count: "exact", head: true }).not("escalation_state", "in", "(responded,closed)"),
    supabase.from("email_message").select("*", { count: "exact", head: true }).eq("status", "needs_review"),
    supabase
      .from("hearing")
      .select("id, date, purpose, matter:matter_id (id, title)")
      .gte("date", today)
      .order("date", { ascending: true })
      .limit(6),
  ]);

  const stats = [
    { label: "Tracked cases", value: matters.count ?? 0, icon: "cases" as const, href: "/dashboard/cases" },
    { label: "Upcoming hearings", value: hearings.count ?? 0, icon: "calendar" as const, href: "/dashboard/calendar" },
    { label: "Open deadlines", value: deadlines.count ?? 0, icon: "clock" as const, href: "/dashboard/calendar" },
    { label: "Active notices", value: notices.count ?? 0, icon: "notices" as const, href: "/dashboard/notices" },
  ];

  return (
    <div className="space-y-8">
      <PageHeader title="Overview" subtitle="Everything on your plate, in one place.">
        <Link href="/dashboard/cases" className="btn-primary">
          <Icon name="plus" className="h-4 w-4" /> Add case
        </Link>
      </PageHeader>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="focus:outline-none">
            <Stat label={s.label} value={s.value} icon={s.icon} />
          </Link>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="text-base font-medium">Upcoming hearings</h2>
            <Link href="/dashboard/calendar" className="text-sm font-medium text-brand-600 hover:underline">
              Calendar →
            </Link>
          </div>
          {upcoming.data && upcoming.data.length ? (
            <ul className="divide-y divide-line">
              {upcoming.data.map((h) => {
                const m = h.matter as unknown as { id: string; title: string } | null;
                return (
                  <li key={h.id} className="flex items-center gap-4 px-5 py-3.5">
                    <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                      <span className="text-[0.65rem] uppercase leading-none">{new Date(h.date).toLocaleDateString("en-IN", { month: "short" })}</span>
                      <span className="text-sm font-semibold leading-tight">{new Date(h.date).getDate()}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link href={m ? `/dashboard/cases/${m.id}` : "#"} className="block truncate font-medium hover:text-brand-600">
                        {m?.title ?? "Hearing"}
                      </Link>
                      <p className="truncate text-xs text-ink-muted">{h.purpose ?? "Hearing"} · {fmtDate(h.date)}</p>
                    </div>
                    <Icon name="chevron" className="h-4 w-4 text-ink-faint" />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-ink-muted">No upcoming hearings. Add a case to start tracking.</p>
          )}
        </Card>

        <Card>
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-base font-medium">Inbox review</h2>
          </div>
          <div className="px-5 py-6">
            <p className="font-serif text-4xl font-semibold">{review.count ?? 0}</p>
            <p className="mt-1 text-sm text-ink-muted">emails waiting to be filed to a client or case.</p>
            <Link href="/dashboard/inbox" className="btn-secondary mt-5 w-full">
              <Icon name="inbox" className="h-4 w-4" /> Open inbox
            </Link>
          </div>
        </Card>
      </section>

      <div className="flex items-center justify-between gap-4">
        <Disclaimer />
        <Badge tone="brand"><Icon name="dot" className="h-2.5 w-2.5" /> Live</Badge>
      </div>
    </div>
  );
}
