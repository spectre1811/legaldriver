import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type CalEvent = { date: string; title: string; kind: "hearing" | "causelist"; href: string; meta?: string };

function monthBounds(month: string): { start: string; end: string; label: string; prev: string; next: string } {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));
  const prevD = new Date(Date.UTC(y, m - 2, 1));
  const nextD = new Date(Date.UTC(y, m, 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 7);
  return {
    start: first.toISOString().slice(0, 10),
    end: last.toISOString().slice(0, 10),
    label: first.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }),
    prev: fmt(prevD),
    next: fmt(nextD),
  };
}

export default async function CalendarPage({ searchParams }: { searchParams: { month?: string } }) {
  const now = new Date();
  const month = searchParams.month ?? now.toISOString().slice(0, 7);
  const { start, end, label, prev, next } = monthBounds(month);

  const supabase = createClient();
  const { data: hearings } = await supabase
    .from("hearing")
    .select("id, date, purpose, matter:matter_id (id, title)")
    .gte("date", start)
    .lte("date", end)
    .order("date", { ascending: true });

  const { data: causeList } = await supabase
    .from("cause_list_entry")
    .select("id, list_date, court, item_no, cnr, matter_id")
    .gte("list_date", start)
    .lte("list_date", end)
    .order("list_date", { ascending: true });

  const events: CalEvent[] = [
    ...(hearings ?? []).map((h): CalEvent => {
      const m = h.matter as unknown as { id: string; title: string } | null;
      return {
        date: h.date,
        title: m?.title ?? "Hearing",
        kind: "hearing",
        href: m ? `/dashboard/cases/${m.id}` : "#",
        meta: h.purpose ?? undefined,
      };
    }),
    ...(causeList ?? []).map((c): CalEvent => ({
      date: c.list_date,
      title: `Cause list${c.item_no ? ` #${c.item_no}` : ""}: ${c.cnr ?? "case"}`,
      kind: "causelist",
      href: c.matter_id ? `/dashboard/cases/${c.matter_id}` : "/dashboard/cases",
      meta: c.matter_id ? "tracked" : "not tracked — add?",
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const byDay = new Map<string, CalEvent[]>();
  for (const e of events) (byDay.get(e.date) ?? byDay.set(e.date, []).get(e.date)!).push(e);

  // Build a 6-week grid starting on the Sunday on/before the 1st.
  const firstOfMonth = new Date(`${start}T00:00:00Z`);
  const gridStart = new Date(firstOfMonth);
  gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setUTCDate(d.getUTCDate() + i);
    return d;
  });
  const todayStr = now.toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Calendar</h1>
          <p className="mt-1 text-sm text-slate-500">
            <span className="inline-block h-2 w-2 rounded-sm bg-blue-400 align-middle" /> hearings
            <span className="ml-2 inline-block h-2 w-2 rounded-sm bg-amber-400 align-middle" /> cause list
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/dashboard/calendar?month=${prev}`} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100">←</Link>
          <span className="min-w-40 text-center text-sm font-medium text-ink">{label}</span>
          <Link href={`/dashboard/calendar?month=${next}`} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100">→</Link>
        </div>
      </header>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 text-sm">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="bg-slate-50 px-2 py-2 text-center text-xs font-medium uppercase text-slate-500">{d}</div>
        ))}
        {days.map((d) => {
          const ds = d.toISOString().slice(0, 10);
          const inMonth = ds >= start && ds <= end;
          const dayEvents = byDay.get(ds) ?? [];
          return (
            <div key={ds} className={`min-h-24 bg-white p-1.5 ${inMonth ? "" : "bg-slate-50 text-slate-300"}`}>
              <div className={`mb-1 text-xs ${ds === todayStr ? "font-bold text-accent" : "text-slate-400"}`}>
                {d.getUTCDate()}
              </div>
              <div className="space-y-1">
                {dayEvents.slice(0, 3).map((e, i) => (
                  <Link key={i} href={e.href} title={`${e.title}${e.meta ? " · " + e.meta : ""}`}
                    className={`block truncate rounded px-1 py-0.5 text-xs ${
                      e.kind === "causelist"
                        ? "bg-amber-50 text-amber-800 hover:bg-amber-100"
                        : "bg-blue-50 text-accent hover:bg-blue-100"
                    }`}>
                    {e.title}
                  </Link>
                ))}
                {dayEvents.length > 3 && <p className="text-xs text-slate-400">+{dayEvents.length - 3} more</p>}
              </div>
            </div>
          );
        })}
      </div>

      <section>
        <h2 className="mb-2 font-medium text-ink">Agenda — {label}</h2>
        <div className="rounded-lg border border-slate-200 bg-white">
          {events.length ? (
            <ul className="divide-y divide-slate-100">
              {events.map((e, i) => (
                <li key={i} className="flex items-center justify-between px-4 py-2 text-sm">
                  <Link href={e.href} className="font-medium text-ink hover:underline">{e.title}</Link>
                  <span className="text-slate-500">
                    {new Date(e.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" })}
                    {e.meta ? ` · ${e.meta}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-6 text-center text-sm text-slate-400">No hearings this month.</p>
          )}
        </div>
      </section>
    </div>
  );
}
