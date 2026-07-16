import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Disclaimer } from "@/components/court";
import { Icon } from "@/components/icons";
import { cleanPurpose } from "@/lib/court/code-labels";
import { AddEntry } from "./add-entry";
import { Agenda, type AgendaEvent } from "./agenda";
import { KIND_STYLE, KIND_LABEL, type Kind } from "./kinds";

type CalEvent = AgendaEvent;
type View = "month" | "week" | "list";

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDaysUTC(base: Date, n: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));
  const fmt = (d: Date) => d.toISOString().slice(0, 7);
  return {
    start: iso(first),
    end: iso(last),
    label: first.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }),
    prev: fmt(new Date(Date.UTC(y, m - 2, 1))),
    next: fmt(new Date(Date.UTC(y, m, 1))),
  };
}

// Map raw rows for a date range into normalized events. Shared by the month grid,
// the week strip and the rolling agenda.
async function loadEvents(
  supabase: ReturnType<typeof createClient>,
  start: string,
  end: string,
  t: Awaited<ReturnType<typeof getTranslations>>,
): Promise<CalEvent[]> {
  const [{ data: hearings }, { data: causeList }, { data: deadlines }, { data: events }, { data: ip }, { data: listed }] = await Promise.all([
    supabase.from("hearing").select("id, date, purpose, matter:matter_id (id, title)").gte("date", start).lte("date", end),
    supabase.from("cause_list_entry").select("id, list_date, item_no, cnr, matter_id").gte("list_date", start).lte("list_date", end),
    supabase.from("deadline").select("id, due_date, kind, matter_id").eq("status", "open").gte("due_date", start).lte("due_date", end),
    supabase.from("calendar_event").select("id, event_date, title, kind, matter_id").gte("event_date", start).lte("event_date", end),
    supabase.from("ip_asset").select("id, title, type, renewal_date").gte("renewal_date", start).lte("renewal_date", end),
    supabase.from("activity_event").select("id, matter_id, meta, matter:matter_id (title)").eq("type", "case.listed").gte("meta->>date", start).lte("meta->>date", end),
  ]);

  return [
    ...(hearings ?? []).map((h): CalEvent => {
      const m = h.matter as unknown as { id: string; title: string } | null;
      return { id: `h-${h.id}`, date: h.date, title: m?.title ?? t("hearingFallback"), kind: "hearing", href: m ? `/dashboard/cases/${m.id}` : null, meta: h.purpose ? cleanPurpose(h.purpose) : undefined, deletable: false };
    }),
    ...(causeList ?? []).map((c): CalEvent => ({ id: `c-${c.id}`, date: c.list_date, title: t("causeListTitle", { cnr: c.cnr ?? t("caseFallback") }), kind: "causelist", href: c.matter_id ? `/dashboard/cases/${c.matter_id}` : "/dashboard/cases", meta: c.item_no ? t("itemMeta", { n: c.item_no }) : undefined, deletable: false })),
    ...(deadlines ?? []).map((d): CalEvent => ({ id: `d-${d.id}`, date: d.due_date, title: d.kind.replace(/_/g, " "), kind: "deadline", href: d.matter_id ? `/dashboard/cases/${d.matter_id}` : null, deletable: false })),
    ...(events ?? []).map((e): CalEvent => ({ id: e.id, date: e.event_date, title: e.title, kind: "event", href: e.matter_id ? `/dashboard/cases/${e.matter_id}` : null, meta: e.kind, deletable: true })),
    ...(ip ?? []).filter((a) => a.renewal_date).map((a): CalEvent => ({ id: `i-${a.id}`, date: a.renewal_date as string, title: t("ipRenewalTitle", { title: a.title }), kind: "iprenewal", href: "/dashboard/ip", meta: a.type ?? undefined, deletable: false })),
    ...(listed ?? []).map((l): CalEvent => {
      const meta = (l.meta ?? {}) as { date?: string; itemNo?: string | null; type?: string | null };
      const m = l.matter as unknown as { title: string } | null;
      return { id: `l-${l.id}`, date: meta.date ?? "", title: m?.title ?? t("causeListTitle", { cnr: t("caseFallback") }), kind: "causelist", href: l.matter_id ? `/dashboard/cases/${l.matter_id}` : null, meta: meta.itemNo ? t("itemMeta", { n: meta.itemNo }) : (meta.type ?? undefined), deletable: false };
    }).filter((e) => e.date),
  ].sort((a, b) => a.date.localeCompare(b.date));
}

function relativeLabel(ds: string, todayStr: string, tomorrowStr: string, t: Awaited<ReturnType<typeof getTranslations>>) {
  if (ds === todayStr) return t("today");
  if (ds === tomorrowStr) return t("tomorrow");
  return new Date(`${ds}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", timeZone: "UTC" });
}

// One month/week grid cell. `dim` softens out-of-month days; weekends carry a sand tint.
function DayCell({ date, events, isToday, isWeekend, dim, max, t }: { date: Date; events: CalEvent[]; isToday: boolean; isWeekend: boolean; dim: boolean; max: number; t: Awaited<ReturnType<typeof getTranslations>> }) {
  const bg = isWeekend ? "bg-ec-paper-3/60" : dim ? "bg-ec-paper-2/40" : "bg-ec-paper-2";
  return (
    <div className={`min-h-[104px] border-b border-r border-ec-hair p-1.5 last:border-r-0 ${bg}`}>
      <div className="flex items-center justify-between">
        <span className={`inline-block font-mono text-[11px] ${dim ? "text-ec-ink-3" : isWeekend ? "text-ec-ink-3" : "text-ec-ink"} ${isToday ? "border-b-2 border-ec-honey" : ""}`}>
          {String(date.getUTCDate()).padStart(2, "0")}
        </span>
      </div>
      <ul className="mt-1 space-y-0.5">
        {events.slice(0, max).map((e) => {
          const row = (
            <span className="flex items-start gap-1 truncate text-[10.5px] text-ec-ink-2">
              <span aria-hidden="true" className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${KIND_STYLE[e.kind].dot}`} />
              <span className="truncate">{e.title}</span>
            </span>
          );
          return (
            <li key={e.id}>
              {e.href ? <Link href={e.href} className="block hover:text-ec-ink">{row}</Link> : row}
            </li>
          );
        })}
        {events.length > max && <li className="num text-[10px] text-ec-ink-3">{t("more", { count: events.length - max })}</li>}
      </ul>
    </div>
  );
}

export default async function DiaryPage({ searchParams }: { searchParams: { month?: string; view?: string } }) {
  const t = await getTranslations("calendar");
  const tc = await getTranslations("common");
  const now = new Date();
  const view: View = searchParams.view === "week" ? "week" : searchParams.view === "list" ? "list" : "month";
  const month = searchParams.month ?? now.toISOString().slice(0, 7);
  const { start, end, label, prev, next } = monthBounds(month);

  const supabase = createClient();

  const todayStr = iso(now);
  const tomorrowStr = iso(addDaysUTC(now, 1));
  const day7Str = iso(addDaysUTC(now, 7));
  const horizonStr = iso(addDaysUTC(now, 30));
  const plus60Str = iso(addDaysUTC(now, 60));

  // Current week (Sun–Sat) — the Week view + the "This week" rail both anchor here.
  const weekStart = addDaysUTC(now, -now.getUTCDay());
  const weekStartStr = iso(weekStart);
  const weekEndStr = iso(addDaysUTC(weekStart, 6));

  const [gridEvents, upcomingAll, weekEvents, { data: dlRows }, { data: matters }] = await Promise.all([
    loadEvents(supabase, start, end, t),
    loadEvents(supabase, todayStr, horizonStr, t),
    view === "week" ? loadEvents(supabase, weekStartStr, weekEndStr, t) : Promise.resolve([] as CalEvent[]),
    // Open deadlines ARE the limitation/procedural-window book (jurisdiction-aware: Limitation Act, CPC, NI-138).
    supabase.from("deadline").select("id, kind, due_date, jurisdiction_rule, matter:matter_id (title)").eq("status", "open").gte("due_date", todayStr).lte("due_date", plus60Str).order("due_date", { ascending: true }).limit(8),
    supabase.from("matter").select("id, title").order("title"),
  ]);

  // ── Month grid cells (6 weeks) ──
  const gridByDay = new Map<string, CalEvent[]>();
  for (const e of gridEvents) (gridByDay.get(e.date) ?? gridByDay.set(e.date, []).get(e.date)!).push(e);
  const gridStart = addDaysUTC(new Date(`${start}T00:00:00Z`), -new Date(`${start}T00:00:00Z`).getUTCDay());
  const monthDays = Array.from({ length: 42 }, (_, i) => addDaysUTC(gridStart, i));

  // ── Week strip cells ──
  const weekByDay = new Map<string, CalEvent[]>();
  for (const e of weekEvents) (weekByDay.get(e.date) ?? weekByDay.set(e.date, []).get(e.date)!).push(e);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDaysUTC(weekStart, i));
  const weekRange = `${weekStart.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" })} – ${addDaysUTC(weekStart, 6).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" })}`;

  // ── List (rolling 30-day agenda) ──
  const groupMap = new Map<string, CalEvent[]>();
  for (const e of upcomingAll) (groupMap.get(e.date) ?? groupMap.set(e.date, []).get(e.date)!).push(e);
  const listGroups = [...groupMap.entries()].map(([date, evs]) => ({
    date,
    relative: relativeLabel(date, todayStr, tomorrowStr, t),
    label: new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" }),
    events: evs,
  }));

  // ── Rails ──
  const thisWeek = upcomingAll.filter((e) => e.date <= day7Str).slice(0, 6);
  const limitations = (dlRows ?? []).map((d) => {
    const m = d.matter as unknown as { title: string } | null;
    const daysLeft = Math.round((Date.parse(`${d.due_date}T00:00:00Z`) - Date.parse(`${todayStr}T00:00:00Z`)) / 86400000);
    return { id: d.id, title: m?.title ?? d.kind.replace(/_/g, " "), sub: d.jurisdiction_rule as string | null, due: d.due_date, daysLeft };
  });

  const weekdayNames = [t("weekday.sun"), t("weekday.mon"), t("weekday.tue"), t("weekday.wed"), t("weekday.thu"), t("weekday.fri"), t("weekday.sat")];
  const centerLabel = view === "week" ? weekRange : view === "list" ? t("next30Days") : label;
  const views: View[] = ["month", "week", "list"];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-[1.7rem] font-medium leading-tight tracking-tight text-ec-ink">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ec-ink-3">{t("subtitle")}</p>
      </header>

      {/* ── Toolbar (single row) ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label={t("viewLabel")} className="flex items-center rounded-ec-s border border-ec-hair bg-ec-paper-2 p-0.5">
          {views.map((v) => (
            <Link
              key={v}
              role="tab"
              aria-selected={view === v}
              href={v === "month" ? `/dashboard/calendar?month=${month}` : `/dashboard/calendar?view=${v}`}
              className={`rounded-ec-s px-3 py-1 text-[12px] transition-colors ${view === v ? "bg-ec-ink text-ec-paper" : "text-ec-ink-2 hover:text-ec-ink"}`}
            >
              {t(`view.${v}`)}
            </Link>
          ))}
        </div>

        <Link href="/dashboard/calendar" className="inline-flex h-9 items-center rounded-ec-s border border-ec-hair bg-ec-paper-2 px-3 text-[12.5px] font-medium text-ec-ink transition-colors hover:bg-ec-paper-3">
          {t("todayBtn")}
        </Link>

        <div className="mx-auto flex items-center gap-3">
          {view === "month" && (
            <Link href={`/dashboard/calendar?month=${prev}`} aria-label={t("prevMonth")} className="grid h-8 w-8 place-items-center rounded-ec-s text-ec-ink-3 hover:bg-ec-paper-3 hover:text-ec-ink">
              <Icon name="back" className="h-4 w-4" />
            </Link>
          )}
          <h2 className="font-display text-[28px] leading-none text-ec-ink">{centerLabel}</h2>
          {view === "month" && (
            <Link href={`/dashboard/calendar?month=${next}`} aria-label={t("nextMonth")} className="grid h-8 w-8 place-items-center rounded-ec-s text-ec-ink-3 hover:bg-ec-paper-3 hover:text-ec-ink">
              <Icon name="chevron" className="h-4 w-4" />
            </Link>
          )}
        </div>

        <div className="relative">
          <AddEntry matters={matters ?? []} />
        </div>
      </div>

      {view === "list" ? (
        <div className="overflow-hidden rounded-ec-s border border-ec-hair bg-ec-paper-2">
          <Agenda groups={listGroups} />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          {/* Grid (month or week) */}
          <div className="overflow-hidden rounded-ec-s border border-ec-hair bg-ec-paper-2">
            <div className="grid grid-cols-7 border-b border-ec-hair bg-ec-paper-3 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-ec-ink-3">
              {weekdayNames.map((d) => (
                <div key={d} className="px-2 py-2">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {(view === "week" ? weekDays : monthDays).map((d) => {
                const ds = iso(d);
                const col = d.getUTCDay();
                return (
                  <DayCell
                    key={ds}
                    date={d}
                    events={(view === "week" ? weekByDay : gridByDay).get(ds) ?? []}
                    isToday={ds === todayStr}
                    isWeekend={col === 0 || col === 6}
                    dim={view === "month" && (ds < start || ds > end)}
                    max={view === "week" ? 6 : 3}
                    t={t}
                  />
                );
              })}
            </div>
          </div>

          {/* Right rail */}
          <aside className="space-y-4" aria-label={t("railLabel")}>
            <section className="rounded-ec-s border border-ec-hair bg-ec-paper-2">
              <div className="border-b border-ec-hair bg-ec-paper-3 px-4 py-2">
                <p className="ec-label">{t("thisWeek")}</p>
              </div>
              {thisWeek.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-ec-ink-3">{t("noThisWeek")}</p>
              ) : (
                <ul className="divide-y divide-ec-hair">
                  {thisWeek.map((e) => (
                    <li key={e.id} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="num text-[11px] uppercase tracking-[0.14em] text-ec-ink">
                          {new Date(`${e.date}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" })}
                        </span>
                        <span className={`shrink-0 rounded-[3px] px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] ${KIND_STYLE[e.kind].chip}`}>
                          {KIND_LABEL[e.kind]}
                        </span>
                      </div>
                      {e.href ? (
                        <Link href={e.href} className="mt-1 block font-display text-[13.5px] text-ec-ink hover:text-ec-bronze">{e.title}</Link>
                      ) : (
                        <p className="mt-1 font-display text-[13.5px] text-ec-ink">{e.title}</p>
                      )}
                      {e.meta && <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ec-ink-3">{e.meta}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-ec-s border border-ec-hair bg-ec-paper-2">
              <div className="border-b border-ec-hair bg-ec-paper-3 px-4 py-2">
                <p className="ec-label">{t("limitationWatch")}</p>
              </div>
              {limitations.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-ec-ink-3">{t("noLimitations")}</p>
              ) : (
                <ul className="divide-y divide-ec-hair">
                  {limitations.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-2 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-display text-[13px] text-ec-ink">{l.title}</p>
                        <p className="mt-0.5 num text-[10px] text-ec-ink-3">
                          {new Date(`${l.due}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-[3px] px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] ${l.daysLeft < 7 ? "bg-ec-danger-t text-ec-danger" : "bg-ec-paper-3 text-ec-ink-2"}`}>
                        {t("daysLeft", { n: String(Math.max(0, l.daysLeft)).padStart(2, "0") })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      )}

      <Disclaimer text={tc("disclaimer")} />
    </div>
  );
}
