import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Stat, Disclaimer } from "@/components/ui";
import { Icon } from "@/components/icons";
import { AddEntry } from "./add-entry";
import { FilterChips } from "./filter-chips";
import { Agenda, type AgendaEvent } from "./agenda";
import { KIND_STYLE, KIND_LABEL, KIND_ORDER, type Kind } from "./kinds";

type CalEvent = AgendaEvent;

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

function parseTypes(raw: string | undefined): Kind[] {
  // Absent param → all on (clean default). A present param (even all-off,
  // encoded as "none") is respected so chip toggles round-trip correctly.
  if (raw === undefined) return [...KIND_ORDER];
  const set = new Set(raw.split(",").map((s) => s.trim()));
  return KIND_ORDER.filter((k) => set.has(k));
}

// Map raw rows for a date range into normalized events. Used for both the month
// grid window and the rolling 30-day agenda window.
async function loadEvents(supabase: ReturnType<typeof createClient>, start: string, end: string): Promise<CalEvent[]> {
  const [{ data: hearings }, { data: causeList }, { data: deadlines }, { data: events }, { data: ip }] = await Promise.all([
    supabase.from("hearing").select("id, date, purpose, matter:matter_id (id, title)").gte("date", start).lte("date", end),
    supabase.from("cause_list_entry").select("id, list_date, item_no, cnr, matter_id").gte("list_date", start).lte("list_date", end),
    supabase.from("deadline").select("id, due_date, kind, matter_id").gte("due_date", start).lte("due_date", end),
    supabase.from("calendar_event").select("id, event_date, title, kind, matter_id").gte("event_date", start).lte("event_date", end),
    supabase.from("ip_asset").select("id, title, type, renewal_date").gte("renewal_date", start).lte("renewal_date", end),
  ]);

  return [
    ...(hearings ?? []).map((h): CalEvent => {
      const m = h.matter as unknown as { id: string; title: string } | null;
      return { id: `h-${h.id}`, date: h.date, title: m?.title ?? "Hearing", kind: "hearing", href: m ? `/dashboard/cases/${m.id}` : null, meta: h.purpose ?? undefined, deletable: false };
    }),
    ...(causeList ?? []).map((c): CalEvent => ({ id: `c-${c.id}`, date: c.list_date, title: `Cause list: ${c.cnr ?? "case"}`, kind: "causelist", href: c.matter_id ? `/dashboard/cases/${c.matter_id}` : "/dashboard/cases", meta: c.item_no ? `Item ${c.item_no}` : undefined, deletable: false })),
    ...(deadlines ?? []).map((d): CalEvent => ({ id: `d-${d.id}`, date: d.due_date, title: d.kind, kind: "deadline", href: d.matter_id ? `/dashboard/cases/${d.matter_id}` : null, deletable: false })),
    ...(events ?? []).map((e): CalEvent => ({ id: e.id, date: e.event_date, title: e.title, kind: "event", href: e.matter_id ? `/dashboard/cases/${e.matter_id}` : null, meta: e.kind, deletable: true })),
    ...(ip ?? []).filter((a) => a.renewal_date).map((a): CalEvent => ({ id: `i-${a.id}`, date: a.renewal_date as string, title: `IP renewal: ${a.title}`, kind: "iprenewal", href: "/dashboard/ip", meta: a.type ?? undefined, deletable: false })),
  ].sort((a, b) => a.date.localeCompare(b.date));
}

function relativeLabel(ds: string, todayStr: string, tomorrowStr: string) {
  if (ds === todayStr) return "Today";
  if (ds === tomorrowStr) return "Tomorrow";
  return new Date(`${ds}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", timeZone: "UTC" });
}

export default async function CalendarPage({ searchParams }: { searchParams: { month?: string; types?: string } }) {
  const now = new Date();
  const month = searchParams.month ?? now.toISOString().slice(0, 7);
  const { start, end, label, prev, next } = monthBounds(month);
  const activeTypes = parseTypes(searchParams.types);
  const activeSet = new Set(activeTypes);

  const supabase = createClient();

  const todayStr = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);
  const horizon = new Date(now);
  horizon.setUTCDate(horizon.getUTCDate() + 30);
  const horizonStr = horizon.toISOString().slice(0, 10);

  // Grid uses the viewed-month window; the agenda + stats use a rolling 30-day
  // window from today regardless of which month is on screen.
  const [gridEvents, upcomingAll, { data: matters }] = await Promise.all([
    loadEvents(supabase, start, end),
    loadEvents(supabase, todayStr, horizonStr),
    supabase.from("matter").select("id, title").order("title"),
  ]);

  // Stat strip: counts over the next 7 and 30 days (all types, unfiltered, so
  // the headline numbers stay stable as chips toggle).
  const day7 = new Date(now);
  day7.setUTCDate(day7.getUTCDate() + 7);
  const day7Str = day7.toISOString().slice(0, 10);
  const within = (e: CalEvent, endStr: string) => e.date >= todayStr && e.date <= endStr;
  const count = (kinds: Kind[], endStr: string) => upcomingAll.filter((e) => kinds.includes(e.kind) && within(e, endStr)).length;
  const stats = {
    hearings7: count(["hearing"], day7Str),
    hearings30: count(["hearing"], horizonStr),
    deadlines7: count(["deadline", "iprenewal"], day7Str),
    deadlines30: count(["deadline", "iprenewal"], horizonStr),
    events7: count(["event"], day7Str),
    events30: count(["event"], horizonStr),
  };

  // Apply the type filter to both surfaces.
  const grid = gridEvents.filter((e) => activeSet.has(e.kind));
  const upcoming = upcomingAll.filter((e) => activeSet.has(e.kind));

  const byDay = new Map<string, CalEvent[]>();
  for (const e of grid) (byDay.get(e.date) ?? byDay.set(e.date, []).get(e.date)!).push(e);

  // Group the agenda by day.
  const groupMap = new Map<string, CalEvent[]>();
  for (const e of upcoming) (groupMap.get(e.date) ?? groupMap.set(e.date, []).get(e.date)!).push(e);
  const groups = [...groupMap.entries()].map(([date, evs]) => ({
    date,
    relative: relativeLabel(date, todayStr, tomorrowStr),
    label: new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" }),
    events: evs,
  }));

  const gridStart = new Date(`${start}T00:00:00Z`);
  gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setUTCDate(d.getUTCDate() + i); return d; });

  return (
    <div className="space-y-6">
      <PageHeader title="Calendar" subtitle="Hearings, cause list, deadlines and your own entries — on one planning surface.">
        <div className="relative flex items-center gap-1.5">
          <Link href={`/dashboard/calendar?month=${prev}${searchParams.types ? `&types=${searchParams.types}` : ""}`} className="btn-secondary px-2.5"><Icon name="back" className="h-4 w-4" /></Link>
          <span className="min-w-36 text-center text-sm font-medium">{label}</span>
          <Link href={`/dashboard/calendar?month=${next}${searchParams.types ? `&types=${searchParams.types}` : ""}`} className="btn-secondary px-2.5"><Icon name="chevron" className="h-4 w-4" /></Link>
          <AddEntry matters={matters ?? []} />
        </div>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Hearings" icon="scale" value={stats.hearings7} hint={`${stats.hearings30} in next 30 days`} />
        <Stat label="Deadlines" icon="clock" value={stats.deadlines7} hint={`${stats.deadlines30} in next 30 days · incl. IP renewals`} />
        <Stat label="Reminders" icon="bell" value={stats.events7} hint={`${stats.events30} in next 30 days`} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips active={activeTypes} />
        <span className="text-xs text-ink-faint">Stats cover the next 7 days.</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
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
                    {dayEvents.slice(0, 3).map((e, j) => {
                      const chip = (
                        <span className={`block truncate rounded-md px-1.5 py-0.5 text-[0.7rem] font-medium ${KIND_STYLE[e.kind].chip}`}>{e.title}</span>
                      );
                      return e.href ? (
                        <Link key={j} href={e.href} title={`${e.title}${e.meta ? " · " + e.meta : ""}`} className="block">{chip}</Link>
                      ) : (
                        <span key={j} title={`${e.title}${e.meta ? " · " + e.meta : ""}`} className="block">{chip}</span>
                      );
                    })}
                    {dayEvents.length > 3 && <p className="px-1 text-[0.7rem] text-ink-faint">+{dayEvents.length - 3} more</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="flex flex-col overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="text-base font-medium">Upcoming</h2>
            <span className="text-xs text-ink-faint">Next 30 days</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Agenda groups={groups} />
          </div>
        </Card>
      </div>

      <Disclaimer />
    </div>
  );
}
