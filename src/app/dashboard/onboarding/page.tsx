import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Icon, type IconName } from "@/components/icons";
import { formatCourtDate } from "@/components/court";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";
import { enabledAdvocateProviders } from "@/lib/court/advocate-cases";
import { brand } from "@/lib/brand";
import { AdvocateOnboarding } from "./onboarding-ui";
import { AdvocateForm } from "../settings/advocate-form";
import { Stepper } from "./stepper";
import { onboardingStep } from "./step-state";

export const dynamic = "force-dynamic";
// BP-71: onboarding runs multi-stage server-side (fetch → enrich per-CNR → …). Give the server action
// room so it isn't killed mid-run (Vercel's short default would leave a stuck "running" run + 0 counts).
export const maxDuration = 60;

// WO-338 · Onboarding console page → Daybreak/Chambers. Reskins the page onto the reference
// design-mockups/iteration3/console/onboarding.tsx: the "add advocate" card leads at the top,
// the roster ("Already added") follows, then the honest disclosure — with a real "what you get"
// rail (this month's hearings, from the tenant's OWN data — never the reference's dummy names).
// The live per-advocate lifecycle (assembling/gathering/stalled/complete/error) is unchanged
// (WO-84/WO-100/WO-120) — only <AdvocateOnboarding>'s JSX skin moved, not its state machine.
// AdvocateForm + the Bar-ID progress rail (<Stepper>) are reused unmodified — shared primitives,
// not forked for this page.

const STEP_ICONS: IconName[] = ["edit", "search", "calendar"];

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}
function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export default async function OnboardingPage() {
  const supabase = createClient();
  const t = await getTranslations("onboarding");
  const td = await getTranslations("dashboard.onboarding");
  const locale = await getLocale();
  const tenantId = await getTenantId(supabase);
  const today = new Date();

  const [{ data: advocates }, { data: runs }, { data: matters, count: matterCount }, { data: hearingRows }] = tenantId
    ? await Promise.all([
        supabase.from("advocate").select("id, name, bar_registration_number, state_code").order("created_at", { ascending: true }),
        supabase.from("onboarding_run").select("id, advocate_id, stage, status, counts, message, updated_at, cursor").order("updated_at", { ascending: false }).limit(10),
        supabase.from("matter").select("id, title, cnr, court, next_hearing_date, status", { count: "exact" }).is("deleted_at", null).order("created_at", { ascending: false }).limit(5),
        // "What you get" rail — the tenant's own nearest upcoming hearings (real data, never the
        // reference's dummy "FA/5053"). Same table + shape Overview already reads (today-view.tsx).
        supabase.from("hearing").select("id, date, matter:matter_id (title, cnr, court)").gte("date", isoDay(today)).order("date", { ascending: true }).limit(60),
      ])
    : [{ data: [] }, { data: [] }, { data: [], count: 0 }, { data: [] }];

  const latestByAdvocate = new Map<string, NonNullable<typeof runs>[number]>();
  for (const r of runs ?? []) if (r.advocate_id && !latestByAdvocate.has(r.advocate_id)) latestByAdvocate.set(r.advocate_id, r);

  const providers = enabledAdvocateProviders();
  const providerStr = providers.map((p) => (t.has(`provider.${p}`) ? t(`provider.${p}`) : p)).join(", ") || t("providersNone");
  const b = (c: React.ReactNode) => <strong>{c}</strong>;
  const hasAdvocates = !!advocates && advocates.length > 0;
  const cases = (matterCount ?? 0) > 0 ? matterCount ?? 0 : (matters?.length ?? 0);
  const stepKeys = ["one", "two", "three"] as const;

  // Onboarding progress, derived from real state (never fabricated): no advocate yet → step 1
  // (Bar ID); advocate added but no synced cases → step 2 (Fetch & verify); cases on file → step 3
  // (Practice assembled). Feeds the stepper's gold current-step dot.
  const currentStep = onboardingStep(hasAdvocates, cases);
  const steps: { label: string; icon: IconName }[] = stepKeys.map((k, i) => ({
    label: t(`steps.${k}.label`),
    icon: STEP_ICONS[i],
  }));

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

  // The honest "how it works" disclosure — a wall of prose the first time, so it collapses out of the way
  // once the user has advocates (reference), but leads the hero when they're deciding whether to trust us.
  const howItWorks = (
    <details className="group ec-card px-5 py-4 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-ec-ink-2 hover:text-ec-bronze-deep">
        <Icon name="chevron" className="h-3.5 w-3.5 shrink-0 transition group-open:rotate-90 motion-reduce:transition-none" />
        {t("howHeading")}
      </summary>
      <p className="mt-3 pl-5 text-ec-ink-2">{t.rich("intro1", { b, providers: providerStr })}</p>
      <p className="mt-1.5 pl-5 text-ec-ink-3">{t.rich("intro2", { b, i: (c) => <em>{c}</em> })}</p>
    </details>
  );

  // The top "add an advocate" card — always leads the page (reference's AddAdvocateCard sits above
  // the roster, not buried below it). Centered/bigger framing for the true cold start; compact once a
  // roster already exists. AdvocateForm itself is the SAME shared component used by Settings — reused
  // unmodified, never forked.
  const addAdvocateCard = (
    <div className={`ec-card p-6 ${!hasAdvocates ? "mx-auto max-w-lg text-center" : ""}`}>
      <div className="ec-label">{td("addEyebrow")}</div>
      <h2 className="font-display mt-2 text-[22px] leading-snug text-ec-ink">{t("hero.title")}</h2>
      <p className={`mt-2 text-[13px] text-ec-ink-3 ${!hasAdvocates ? "" : "max-w-xl"}`}>{t("hero.body")}</p>
      <div className={`mt-5 ${!hasAdvocates ? "text-left" : ""}`}>
        <AdvocateForm />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <div className="ec-label">{td("eyebrow")}</div>
        <h1 className="font-display mt-1 text-[1.6rem] font-medium leading-tight tracking-tight text-ec-ink">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ec-ink-3">{t("subtitle")}</p>
      </div>

      <div className="ec-card px-6 py-5 sm:px-8">
        <Stepper steps={steps} current={currentStep} />
      </div>

      <div className="grid gap-9 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-8">
          {addAdvocateCard}

          {hasAdvocates && (
            <>
              {/* The payoff — show the practice we built (WO-61 W3), before the roster mechanics. */}
              {matters && matters.length > 0 && (
                <div className="ec-card overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ec-hair px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-ec-m bg-ec-success-bg text-ec-success">
                        <Icon name="check" className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="font-display text-ec-ink">{t("practice.title")}</p>
                        <p className="num text-sm text-ec-ink-3">{t("practice.count", { n: cases })}</p>
                      </div>
                    </div>
                    <Link href="/dashboard/cases" className="ec-btn ec-btn-ghost text-sm">
                      {t("practice.viewAll")} <Icon name="chevron" className="h-4 w-4" />
                    </Link>
                  </div>
                  <ul className="divide-y divide-ec-hair">
                    {matters.map((m) => (
                      <li key={m.id}>
                        <Link href={`/dashboard/cases/${m.id}`} className="ec-row flex items-center justify-between gap-3 px-5 py-3">
                          <div className="min-w-0">
                            <p className="font-display truncate text-ec-ink">{m.title}</p>
                            <p className="num truncate text-xs text-ec-ink-3">{m.court || m.cnr || ""}</p>
                          </div>
                          <span className="num shrink-0 text-xs text-ec-ink-3">
                            {m.next_hearing_date ? t("practice.nextHearing", { date: (formatCourtDate(m.next_hearing_date) ?? "—") }) : t("practice.noHearing")}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <section>
                <div className="flex items-end justify-between gap-3">
                  <div className="ec-label">{t("yourAdvocates")}</div>
                </div>
                <div className="mt-1.5 h-[3px] border-y border-ec-hair" />
                <ul className="divide-y divide-ec-hair">
                  {advocates.map((a) => {
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
            </>
          )}

          {!hasAdvocates && (
            <p className="text-center text-[12.5px] text-ec-ink-3">{td("rosterEmpty")}</p>
          )}

          {howItWorks}

          <p className="text-xs text-ec-ink-3">
            {t.rich("footer", {
              calendar: (c) => <Link href="/dashboard/calendar" className="text-ec-bronze-deep hover:underline">{c}</Link>,
              cases: (c) => <Link href="/dashboard/cases" className="text-ec-bronze-deep hover:underline">{c}</Link>,
              research: (c) => <Link href="/dashboard/search/judgments" className="text-ec-bronze-deep hover:underline">{c}</Link>,
            })}
          </p>
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
