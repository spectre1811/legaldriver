import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card } from "@/components/ui";
import { Icon } from "@/components/icons";

type CalEvent = { date: string; title: string; kind: "hearing" | "causelist"; href: string; meta?: string };

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));
  const fmt = (d: Date) => d.toISOString().slice(0, 7);
  return {
    start: first.toISOString().slice(0, 10),
    end: last.toISOString().slice(0, 10),
    label: first.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }),
    prev: fmt(new Date(Date.UTC(y, m - 2, 1))),
    next: fmt(new Date(Date.UTC(y, m, 1))),
  };
}

export default async function CalendarPage({ searchParams }: { searchParams: { month?: string } }) {
  const now = new Date();
  const month = searchParams.month ?? now.toISOString().slice(0, 7);
  const { start, end, label, prev, next } = monthBounds(month);

  const supabase = createClient();
  const [{ data: hearings }, { data: causeList }] = await Promise.all([
    supabase.from("hearing").select("id, date, purpose, matter:matter_id (id, title)").gte("date", start).lte("date", end),
    supabase.from("cause_list_entry").select("id, list_date, item_no, cnr, matter_id").gte("list_date", start).lte("list_date", end),
  ]);

  const events: CalEvent[] = [
    ...(hearings ?? []).map((h): CalEvent => {
      const m = h.matter as unknown as { id: string; title: string } | null;
      return { date: h.date, title: m?.title ?? "Hearing", kind: "hearing", href: m ? `/dashboard/cases/${m.id}` : "#", meta: h.purpose ?? undefined };
    }),
    ...(causeList ?? []).map((c): CalEvent => ({
      date: c.list_date, title: `Cause list${c.item_no ? ` #${c.item_no}` : ""}: ${c.cnr ?? "case"}`, kind: "causelist",
      href: c.matter_id ? `/dashboard/cases/${c.matter_id}` : "/dashboard/cases", meta: c.matter_id ? "tracked" : "not tracked",
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const byDay = new Map<string, CalEvent[]>();
  for (const e of events) (byDay.get(e.date) ?? byDay.set(e.date, []).get(e.date)!).push(e);

  const gridStart = new Date(`${start}T00:00:00Z`);
  gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setUTCDate(d.getUTCDate() + i); return d; });
  const todayStr = now.toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader title="Calendar" subtitle="Hearings and your advocate cause list, on one calendar.">
        <div className="flex items-center gap-1.5">
          <Link href={`/dashboard/calendar?month=${prev}`} className="btn-secondary px-2.5"><Icon name="back" className="h-4 w-4" /></Link>
          <span className="min-w-36 text-center text-sm font-medium">{label}</span>
          <Link href={`/dashboard/calendar?month=${next}`} className="btn-secondary px-2.5"><Icon name="chevron" className="h-4 w-4" /></Link>
        </div>
      </PageHeader>

      <div className="flex items-center gap-4 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand-500" /> Hearings</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-brass-400" /> Cause list</span>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="grid grid-cols-7 border-b border-line bg-paper">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="px-2 py-2.5 text-center text-[0.7rem] font-semibold uppercase tracking-wider text-ink-faint">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const ds = d.toISOString().slice(0, 10);
            const inMonth = ds >= start && ds <= end;
            const dayEvents = byDay.get(ds) ?? [];
            return (
              <div key={ds} className={`min-h-[6.5rem] border-b border-r border-line p-1.5 ${i % 7 === 6 ? "border-r-0" : ""} ${inMonth ? "" : "bg-paper/60"}`}>
                <div className={`mb-1 text-xs ${ds === todayStr ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 font-semibold text-white" : inMonth ? "text-ink-soft" : "text-ink-faint"}`}>
                  {d.getUTCDate()}
                </div>
                <div className="space-y-1">
                  {dayEvents.slice(0, 3).map((e, j) => (
                    <Link key={j} href={e.href} title={`${e.title}${e.meta ? " · " + e.meta : ""}`}
                      className={`block truncate rounded-md px-1.5 py-0.5 text-[0.7rem] font-medium ${e.kind === "causelist" ? "bg-amber-50 text-amber-800 hover:bg-amber-100" : "bg-brand-50 text-brand-700 hover:bg-brand-100"}`}>
                      {e.title}
                    </Link>
                  ))}
                  {dayEvents.length > 3 && <p className="px-1 text-[0.7rem] text-ink-faint">+{dayEvents.length - 3} more</p>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-line px-5 py-3"><h2 className="text-base font-medium">Agenda — {label}</h2></div>
        {events.length ? (
          <ul className="divide-y divide-line">
            {events.map((e, i) => (
              <li key={i} className="flex items-center justify-between px-5 py-3 text-sm">
                <Link href={e.href} className="font-medium text-ink hover:text-brand-600">{e.title}</Link>
                <span className="text-xs text-ink-muted">
                  {new Date(e.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" })}{e.meta ? ` · ${e.meta}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-ink-faint">Nothing scheduled this month.</p>
        )}
      </Card>
    </div>
  );
}
