import { getLocale, getTranslations } from "next-intl/server";
import { Icon } from "@/components/icons";
import { formatCourtDate } from "@/components/court";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";
import { brand } from "@/lib/brand";
import { stateBarCouncil } from "@/lib/court/bar-number";
import { onboardingProgress, ONBOARDING_STAGES } from "@/lib/services/onboarding/progress";
import { AdvocateOnboarding } from "./onboarding-ui";
import { OnboardingLead, type ActiveAssembling, type LeadChecklistItem } from "./lead";

export const dynamic = "force-dynamic";
// BP-71: onboarding runs multi-stage server-side (fetch → enrich per-CNR → …). Give the server action
// room so it isn't killed mid-run (Vercel's short default would leave a stuck "running" run + 0 counts).
export const maxDuration = 60;

// WO-338 EXACT-FIDELITY RECONCILE · this page now reproduces design-mockups/iteration3/console/
// onboarding.tsx node-for-node: the dark masthead band, the lead slot (AddAdvocateCard ↔
// GatheringCard, real-data-driven via <OnboardingLead>), the roster ("Already added", real
// per-advocate live status via <AdvocateOnboarding>), the honest disclosure, and the "what you
// get" rail (real month calendar + morning-brief preview — never the reference's dummy names).
// The ONLY reference element deliberately omitted is the <Stamp> bar (founder override). Two prior
// additions that were NOT in the reference are removed here (the Stepper progress rail + a
// "practice" payoff panel) — see the WO-338 PR description for the full section-by-section diff
// against the reference and the discovered capability gap it leaves (per-row Remove / notify-enable).
// The Bar-ID fetch/enrich flow itself (WO-84/WO-100/WO-120) is untouched — restyle only.

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}
function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export default async function OnboardingPage() {
  const supabase = createClient();
  const td = await getTranslations("dashboard.onboarding");
  const tStage = await getTranslations("dashboard.onboarding.lead.stage");
  const locale = await getLocale();
  const tenantId = await getTenantId(supabase);
  const today = new Date();

  const [{ data: advocates }, { data: runs }, { data: hearingRows }] = tenantId
    ? await Promise.all([
        supabase.from("advocate").select("id, name, bar_registration_number, state_code").order("created_at", { ascending: true }),
        supabase.from("onboarding_run").select("id, advocate_id, stage, status, counts, message, updated_at, cursor").order("updated_at", { ascending: false }).limit(10),
        // "What you get" rail — the tenant's own nearest upcoming hearings (real data, never the
        // reference's dummy "FA/5053"). Same table + shape Overview already reads (today-view.tsx).
        supabase.from("hearing").select("id, date, matter:matter_id (title, cnr, court)").gte("date", isoDay(today)).order("date", { ascending: true }).limit(60),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const latestByAdvocate = new Map<string, NonNullable<typeof runs>[number]>();
  for (const r of runs ?? []) if (r.advocate_id && !latestByAdvocate.has(r.advocate_id)) latestByAdvocate.set(r.advocate_id, r);

  const hasAdvocates = !!advocates && advocates.length > 0;

  // ── page-top lead slot — reference: `gathering ? <GatheringCard/> : <AddAdvocateCard/>`, driven by
  // the real most-recently-updated run that's still actively draining (`status: "running"`), not a
  // demo boolean. Server-computed from the SAME `runs` query the roster already reads — no new fetch.
  const activeRun = (runs ?? []).find((r) => r.status === "running") ?? null;
  const activeAdvocate = activeRun ? (advocates ?? []).find((a) => a.id === activeRun.advocate_id) ?? null : null;
  let activeAssembling: ActiveAssembling | null = null;
  if (activeRun && activeAdvocate) {
    const progress = onboardingProgress(activeRun.stage, activeRun.status);
    // The real stage checklist (never the reference's fabricated "87 cases found" specifics) —
    // ONBOARDING_STAGES is the single source both this card and the roster's live meter derive from.
    const checklist: LeadChecklistItem[] = ONBOARDING_STAGES.filter((s) => s !== "done").map((key, i) => ({
      key,
      label: tStage.has(key) ? tStage(key) : key,
      state: i < progress.index ? "done" : i === progress.index ? "running" : "todo",
    }));
    activeAssembling = {
      runId: activeRun.id,
      bar: activeAdvocate.bar_registration_number || activeAdvocate.name,
      councilLabel: stateBarCouncil(activeAdvocate.state_code)?.label ?? null,
      percent: progress.percent,
      checklist,
    };
  }

  // ── "what you get" rail — real upcoming hearings, honest empty when there are none. ──────────
  const upcomingHearings = (hearingRows ?? []).map((h) => ({
    date: h.date as string,
    matter: one(h.matter as unknown as { title: string; cnr: string | null; court: string | null } | null),
  }));
  const nextHearing = upcomingHearings[0] ?? null;
  const monthHearingDays = new Set<number>();
  for (const h of upcomingHearings) {
    const d = new Date(h.date);
    if (d.getUTCFullYear() === today.getFullYear() && d.getUTCMonth() === today.getMonth()) monthHearingDays.add(d.getUTCDate());
  }
  const monthLabel = new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", { month: "long", year: "numeric" }).format(today);
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const firstWeekday = (new Date(today.getFullYear(), today.getMonth(), 1).getDay() + 6) % 7; // Monday-first
  const weekdayLabels = td.raw("sidebar.weekdays") as string[];

  return (
    <div className="space-y-6">
      {/* masthead — reference: <Masthead slim eyebrow="Setup" title="Advocate onboarding" meta="…"/>,
          the per-page dark "engraved" band established by WO-328/WO-339 (not shell chrome). */}
      <div className="mk-engraved -mx-5 rounded-[14px] bg-ec-ink px-5 py-7 sm:-mx-8 sm:px-7">
        <div className="ec-label font-mono !text-ec-honey">{td("eyebrow")}</div>
        <h1 className="font-display mt-2 text-[30px] leading-[1.05] text-ec-paper sm:text-[34px]">{td("masthead.title")}</h1>
        <p className="mt-3 text-[14px] text-ec-line-strong">{td("masthead.meta")}</p>
      </div>

      <div className="grid gap-9 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <OnboardingLead centered={!hasAdvocates} activeAssembling={activeAssembling} />

          {hasAdvocates && (
            <section className="mt-10">
              <div className="flex items-end justify-between gap-3">
                <div className="ec-label">{td("roster.heading")}</div>
              </div>
              <div className="mt-1.5 h-[3px] border-y border-ec-hair" />
              <ul className="divide-y divide-ec-hair">
                {advocates!.map((a) => {
                  const run = latestByAdvocate.get(a.id);
                  const initialRun = run
                    ? {
                        id: run.id,
                        stage: run.stage, status: run.status,
                        counts: (run.counts ?? {}) as Record<string, number>,
                        message: run.message, updatedAt: run.updated_at,
                        cursor: (run.cursor ?? null) as Record<string, unknown> | null,
                      }
                    : null;
                  return (
                    <AdvocateOnboarding
                      key={a.id}
                      advocate={{ id: a.id, name: a.name, bar: a.bar_registration_number, stateCode: a.state_code ? String(a.state_code) : null }}
                      initialRun={initialRun}
                    />
                  );
                })}
              </ul>
            </section>
          )}

          {!hasAdvocates && (
            <p className="mt-8 text-center text-[12.5px] text-ec-ink-3">{td("rosterEmpty")}</p>
          )}

          {/* Disclosure — reference uses a JS-state button/ChevronDown-ChevronRight swap; the native
              <details>/<summary> disclosure widget (already this repo's established pattern) gives the
              identical collapse/rotate visual with no client JS required — a platform-primitive
              substitution, not a structural addition. */}
          <details className="group ec-card mt-8 p-5">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[13px] text-ec-ink-2 hover:text-ec-bronze">
              <Icon name="chevron" className="h-3.5 w-3.5 shrink-0 transition group-open:rotate-90 motion-reduce:transition-none" />
              {td("disclosure.heading")}
            </summary>
            <div className="mt-3 pl-5">
              <p className="text-[13px] text-ec-ink-2">{td("disclosure.body")}</p>
            </div>
          </details>
        </div>

        {/* "What you get" rail — real data (this month's hearings on file), honest empty otherwise. */}
        <aside className="hidden space-y-4 lg:block">
          <div className="ec-label">{td("sidebar.title")}</div>

          <div className="ec-card p-4">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-[15px] text-ec-ink">{monthLabel}</span>
              <span className="ec-label">{td("sidebar.calendarLabel")}</span>
            </div>
            <div className="num mt-3 grid grid-cols-7 gap-1 font-mono text-[10.5px] text-ec-ink-3">
              {weekdayLabels.map((d, i) => (
                <span key={i} className="text-center">{d}</span>
              ))}
              {Array.from({ length: firstWeekday }, (_, i) => <span key={`pad-${i}`} />)}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                <span
                  key={d}
                  className={`relative grid h-6 place-items-center rounded ${monthHearingDays.has(d) ? "text-ec-ink" : "text-ec-ink-2/70"}`}
                >
                  {d}
                  {monthHearingDays.has(d) && <span className="absolute bottom-[2px] h-[3px] w-[3px] rounded-full bg-ec-honey" />}
                </span>
              ))}
            </div>
            <div className="mt-3 border-t border-ec-hair pt-2">
              <span className="num font-mono text-[10.5px] uppercase tracking-[0.1em] text-ec-bronze-deep">
                {monthHearingDays.size > 0 ? td("sidebar.calendarCount", { n: monthHearingDays.size }) : td("sidebar.calendarEmpty")}
              </span>
            </div>
          </div>

          <div className="ec-card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-ec-hair bg-ec-paper-3/60 px-4 py-2">
              <span className="grid h-4 w-4 place-items-center rounded-full bg-ec-success text-white">
                <Icon name="check" className="h-2.5 w-2.5" />
              </span>
              <span className="text-[12.5px] font-medium text-ec-ink">{td("sidebar.briefHeader", { brand: brand.name })}</span>
            </div>
            <div className="p-4">
              {nextHearing ? (
                <div className="rounded-[10px] rounded-tl-[2px] border border-ec-hair bg-ec-paper-3/50 px-3 py-2.5 text-[12.5px] leading-relaxed text-ec-ink-2">
                  {td("sidebar.briefNext", {
                    title: nextHearing.matter?.title ?? nextHearing.matter?.cnr ?? "—",
                    court: nextHearing.matter?.court ?? "—",
                    date: formatCourtDate(nextHearing.date) ?? "—",
                  })}
                </div>
              ) : (
                <p className="rounded-[10px] rounded-tl-[2px] border border-ec-hair bg-ec-paper-3/50 px-3 py-2.5 text-[12.5px] leading-relaxed text-ec-ink-3">
                  {td("sidebar.briefEmpty")}
                </p>
              )}
              <p className="mt-2 text-[11px] text-ec-ink-3">{td("sidebar.briefNote")}</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
