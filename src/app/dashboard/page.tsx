import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/icons";
import { TodayView, type TodayHearing, type TodayFiling, type TodayWeekDay } from "./today-view";

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}
// Supabase returns an embedded FK as an object (or array in some shapes) — normalize.
function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export default async function OverviewPage() {
  const supabase = createClient();
  const tc = await getTranslations("common");
  const now = new Date();
  const today = isoDay(now);

  // Current week, Monday–Saturday (matches the concept's six-day strip).
  const monday = new Date(now);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const days = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return isoDay(d);
  });

  const [upcoming, weekRows, deadlines, review, lastSync, advocateCount, matterCount] = await Promise.all([
    supabase
      .from("hearing")
      .select("id, date, purpose, court_no, judge, matter:matter_id (id, title, cnr, court)")
      .gte("date", today)
      .order("date", { ascending: true })
      .limit(8),
    supabase.from("hearing").select("date").gte("date", days[0]).lte("date", days[5]),
    supabase
      .from("deadline")
      .select("id, kind, due_date, matter:matter_id (title)")
      .eq("status", "open")
      .order("due_date", { ascending: true })
      .limit(4),
    supabase.from("email_message").select("*", { count: "exact", head: true }).eq("status", "needs_review"),
    supabase.from("matter").select("last_synced_at").order("last_synced_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
    supabase.from("advocate").select("id", { count: "exact", head: true }),
    supabase.from("matter").select("id", { count: "exact", head: true }),
  ]);

  const hearings: TodayHearing[] = (upcoming.data ?? []).map((h) => ({
    id: h.id,
    date: h.date,
    purpose: h.purpose,
    courtNo: h.court_no,
    judge: h.judge,
    matter: one(h.matter as unknown as { id: string; title: string; cnr: string | null; court: string | null } | null),
  }));

  const counts = new Map<string, number>();
  for (const r of weekRows.data ?? []) {
    const k = r.date.slice(0, 10);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const week: TodayWeekDay[] = days.map((iso) => ({ iso, count: counts.get(iso) ?? 0, isToday: iso === today }));
  const courts = new Set(hearings.map((h) => h.matter?.court).filter(Boolean)).size;
  const filings: TodayFiling[] = (deadlines.data ?? []).map((d) => ({
    id: d.id,
    kind: d.kind,
    dueDate: d.due_date,
    matterTitle: one(d.matter as unknown as { title: string } | null)?.title ?? null,
  }));

  return (
    <div className="space-y-6">
      <TodayView
        now={now.toISOString()}
        week={week}
        hearings={hearings}
        courts={courts}
        syncedAt={lastSync.data?.last_synced_at ?? null}
        filings={filings}
        inboxReview={review.count ?? 0}
        firstRun={(advocateCount.count ?? 0) === 0 && (matterCount.count ?? 0) === 0}
      />
      <p className="flex items-center gap-1.5 text-xs text-ec-ink-3">
        <Icon name="alert" className="h-3.5 w-3.5" /> {tc("disclaimer")}
      </p>
    </div>
  );
}
