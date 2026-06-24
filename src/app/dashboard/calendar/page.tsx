import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card } from "@/components/ui";
import { Icon } from "@/components/icons";
import { AddEntry } from "./add-entry";

type Kind = "hearing" | "causelist" | "deadline" | "event";
type CalEvent = { date: string; title: string; kind: Kind; href: string; meta?: string };

const KIND_STYLE: Record<Kind, { dot: string; chip: string }> = {
  hearing: { dot: "bg-brand-500", chip: "bg-brand-50 text-brand-700 hover:bg-brand-100" },
  causelist: { dot: "bg-brass-400", chip: "bg-amber-50 text-amber-800 hover:bg-amber-100" },
  deadline: { dot: "bg-rose-500", chip: "bg-rose-50 text-rose-700 hover:bg-rose-100" },
  event: { dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
};

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
  const [{ data: hearings }, { data: causeList }, { data: deadlines }, { data: events }, { data: matters }] = await Promise.all([
    supabase.from("hearing").select("id, date, purpose, matter:matter_id (id, title)").gte("date", start).lte("date", end),
    supabase.from("cause_list_entry").select("id, list_date, item_no, cnr, matter_id").gte("list_date", start).lte("list_date", end),
    supabase.from("deadline").select("id, due_date, kind, matter_id").gte("due_date", start).lte("due_date", end),
    supabase.from("calendar_event").select("id, event_date, title, kind, matter_id").gte("event_date", start).lte("event_date", end),
    supabase.from("matter").select("id, title").order("title"),
  ]);

  const all: CalEvent[] = [
    ...(hearings ?? []).map((h): CalEvent => {
      const m = h.matter as unknown as { id: string; title: string } | null;
      return { date: h.date, title: m?.title ?? "Hearing", kind: "hearing", href: m ? `/dashboard/cases/${m.id}` : "#", meta: h.purpose ?? undefined };
    }),
    ...(causeList ?? []).map((c): CalEvent => ({ date: c.list_date, title: `Cause list: ${c.cnr ?? "case"}`, kind: "causelist", href: c.matter_id ? `/dashboard/cases/${c.matter_id}` : "/dashboard/cases" })),
    ...(deadlines ?? []).map((d): CalEvent => ({ date: d.due_date, title: d.kind, kind: "deadline", href: d.matter_id ? `/dashboard/cases/${d.matter_id}` : "#" })),
    ...(events ?? []).map((e): CalEvent => ({ date: e.event_date, title: e.title, kind: "event", href: e.matter_id ? `/dashboard/cases/${e.matter_id}` : "#", meta: e.kind })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const byDay = new Map<string, CalEvent[]>();
  for (const e of all) (byDay.get(e.date) ?? byDay.set(e.date, []).get(e.date)!).push(e);

  const gridStart = new Date(`${start}T00:00:00Z`);
  gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setUTCDate(d.getUTCDate() + i); return d; });
  const todayStr = now.toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader title="Calendar" subtitle="Hearings, cause list, deadlines and your own entries — on one calendar.">
        <div className="relative flex items-center gap-1.5">
          <Link href={`/dashboard/calendar?month=${prev}`} className="btn-secondary px-2.5"><Icon name="back" className="h-4 w-4" /></Link>
          <span className="min-w-36 text-center text-sm font-medium">{label}</span>
          <Link href={`/dashboard/calendar?month=${next}`} className="btn-secondary px-2.5"><Icon name="chevron" className="h-4 w-4" /></Link>
          <AddEntry matters={matters ?? []} />
        </div>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-4 text-xs text-ink-muted">
        {(Object.keys(KIND_STYLE) as Kind[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5 capitalize"><span className={`inline-block h-2.5 w-2.5 rounded-sm ${KIND_STYLE[k].dot}`} /> {k === "causelist" ? "cause list" : k}</span>
        ))}
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
                      className={`block truncate rounded-md px-1.5 py-0.5 text-[0.7rem] font-medium ${KIND_STYLE[e.kind].chip}`}>
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
        {all.length ? (
          <ul className="divide-y divide-line">
            {all.map((e, i) => (
              <li key={i} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className={`h-2 w-2 shrink-0 rounded-full ${KIND_STYLE[e.kind].dot}`} />
                <Link href={e.href} className="flex-1 font-medium text-ink hover:text-brand-600">{e.title}</Link>
                <span className="text-xs text-ink-muted">{new Date(e.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" })}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-ink-faint">Nothing scheduled this month. Use “Add entry” to create one.</p>
        )}
      </Card>
    </div>
  );
}
