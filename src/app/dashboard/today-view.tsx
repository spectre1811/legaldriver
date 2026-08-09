import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Icon } from "@/components/icons";
import { cleanPurpose } from "@/lib/court/code-labels";
import { CountUp, Reveal } from "./motion";

// Presentational "Today" ledger — Chambers/Daybreak skin (WO-330), matching the
// design reference's layout/hierarchy while binding every value to real data
// (the reference itself is dummy content). Data-driven so it renders from real
// queries in page.tsx and from fixtures in the preview harness. No AI here — the
// right-rail summary is deterministic (AI briefs go through the gateway seam).
export type TodayHearing = {
  id: string;
  date: string;
  purpose: string | null;
  courtNo: string | null;
  judge: string | null;
  matter: { id: string; title: string; cnr: string | null; court: string | null } | null;
};
export type TodayWeekDay = { iso: string; count: number; isToday: boolean };
export type TodayFiling = { id: string; kind: string | null; dueDate: string | null; matterTitle: string | null };

export type TodayViewProps = {
  now: string;
  week: TodayWeekDay[];
  hearings: TodayHearing[];
  courts: number;
  syncedAt: string | null;
  filings: TodayFiling[];
  inboxReview: number;
  // Orders synced this week on the tenant's own matters (RLS-scoped count — see page.tsx).
  ordersThisWeek: number;
  firstRun: boolean;
  activation: { hasAdvocate: boolean; hasCases: boolean };
};

export async function TodayView({
  now,
  week,
  hearings,
  courts,
  syncedAt,
  filings,
  inboxReview,
  ordersThisWeek,
  firstRun,
  activation,
}: TodayViewProps) {
  const t = await getTranslations("today");
  const to = await getTranslations("dashboard.overview");
  // WO-16 W3 — activation checklist: nudge partially-set-up tenants toward first case + WhatsApp alerts.
  const steps = [
    { key: "stepAdvocate", done: activation.hasAdvocate },
    { key: "stepCases", done: activation.hasCases },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const showChecklist = !firstRun && !(activation.hasAdvocate && activation.hasCases);
  const locale = await getLocale();
  const wd = (iso: string, opt: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", opt).format(new Date(iso));
  const todayIso = now.slice(0, 10);
  const time = (ts: string | null) => (ts ? wd(ts, { hour: "2-digit", minute: "2-digit" }) : "—");
  const hearingsThisWeek = week.reduce((sum, d) => sum + d.count, 0);
  const overdueCount = filings.filter((f) => f.dueDate && f.dueDate.slice(0, 10) < todayIso).length;

  return (
    <div className="space-y-4">
      {/* WO-16 W3 — activation checklist (shown until advocate + cases are in) */}
      {showChecklist && (
        <div className="ec-card px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-display text-base font-medium text-ec-ink">{t("activation.title")}</p>
              <p className="text-xs text-ec-ink-3">{t("activation.subtitle")}</p>
            </div>
            <span className="text-xs font-semibold text-ec-bronze-deep">{t("activation.progress", { done: doneCount, total: steps.length })}</span>
          </div>
          <ul className="mt-3 flex flex-wrap gap-2">
            {steps.map((s) => (
              <li key={s.key} className={`flex items-center gap-1.5 rounded-ec-s border px-3 py-1.5 text-sm ${s.done ? "border-ec-hair bg-ec-paper-3 text-ec-ink-3" : "border-ec-bronze bg-ec-bronze-tint text-ec-bronze-deep"}`}>
                <span aria-hidden>{s.done ? "✓" : "○"}</span>
                {s.done ? (
                  <span className="line-through">{t(`activation.${s.key}`)}</span>
                ) : (
                  <Link href="/dashboard/onboarding" className="font-medium hover:underline">{t(`activation.${s.key}`)}</Link>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-xs text-ec-ink-3">{t("activation.whatsappNote")}</p>
        </div>
      )}

      {/* header — vernacular flourish over the localized title, + the week's tagline */}
      <header className="border-b border-ec-hair pb-4">
        <p className="font-display text-sm italic text-ec-bronze-deep">{t("overline")}</p>
        <h1 className="font-display text-[1.7rem] font-medium leading-tight tracking-tight text-ec-ink">{t("title")}</h1>
        <p className="num mt-1 text-sm text-ec-ink-3">
          {wd(now, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {to("tagline")}
        </p>
      </header>

      {/* week strip */}
      <Reveal delay={60} className="num grid grid-cols-6 divide-x divide-ec-hair border-y border-ec-hair" aria-label={t("weekAria")}>
        {week.map((d) => (
          <div key={d.iso} aria-current={d.isToday ? "date" : undefined} className={`px-2 py-3 text-center ${d.isToday ? "bg-ec-bronze-tint/40" : ""}`}>
            <div className="ec-label">{wd(d.iso, { weekday: "short", timeZone: "UTC" })}</div>
            <div className="font-display mt-1 text-[20px] leading-none text-ec-ink">{Number(d.iso.slice(8, 10))}</div>
            <div className={`mt-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] ${d.isToday ? "text-ec-bronze-deep" : "text-ec-ink-3"}`}>
              {d.count === 0 ? "—" : t("listed", { count: d.count })}
            </div>
            {d.isToday && <div className="mx-auto mt-1.5 h-[2px] w-6 rounded-full bg-ec-honey" />}
          </div>
        ))}
      </Reveal>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
        {/* ledger */}
        <Reveal delay={120} as="section" className="min-w-0">
          {hearings.length > 0 ? (
            <>
              <div className="mb-1.5 flex items-end justify-between gap-3">
                <div className="ec-label">{to("sectionHearings")}</div>
                <span className="ec-label">{t("listed", { count: hearings.length })}</span>
              </div>
              <div className="mb-4 h-[3px] border-y border-ec-hair" />
              <ul className="divide-y divide-ec-hair">
                {hearings.map((h) => {
                  const isToday = h.date.slice(0, 10) === todayIso;
                  return (
                    <li key={h.id} className="ec-row flex flex-wrap items-start gap-x-3 gap-y-1 py-3">
                      <span className="num w-14 shrink-0 pt-0.5 font-mono text-[12px] text-ec-ink-2">{time(h.date)}</span>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={h.matter ? `/dashboard/cases/${h.matter.id}` : "#"}
                          className="font-display block truncate text-[16px] text-ec-ink hover:text-ec-bronze-deep"
                        >
                          {h.matter?.title ?? t("hearingFallback")}
                        </Link>
                        <div className="num mt-0.5 truncate font-mono text-[10.5px] uppercase tracking-[0.08em] text-ec-ink-3">
                          {[h.matter?.court, h.courtNo].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </div>
                      {/* basis-full forces the chip onto its own indented line when the row is too
                          narrow to fit alongside a long real-data purpose string (mobile widths) —
                          the reference's dummy purposes were 1-2 words, real ones run much longer. */}
                      {h.purpose && (
                        <span className={`ec-chip ${isToday ? "ec-chip-hot" : ""} ml-14 basis-full sm:ml-0 sm:basis-auto`}>
                          {cleanPurpose(h.purpose)}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="num pt-3 text-xs text-ec-ink-3">
                {t("summary", { count: hearings.length, courts })}
                {syncedAt ? ` · ${t("syncedAt", { time: time(syncedAt) })}` : ""}
              </p>
            </>
          ) : firstRun ? (
            /* WO-16 first-run activation — turn the cold empty dashboard into a guided setup. */
            <div className="ec-card px-6 py-10 sm:px-10 sm:py-12">
              <p className="mb-2 font-display text-[15px] italic text-ec-bronze-deep">{t("firstRun.eyebrow")}</p>
              <h2 className="font-display text-2xl font-medium text-ec-ink">{t("firstRun.title")}</h2>
              <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-ec-ink-2">{t("firstRun.body")}</p>
              <ol className="mt-6 grid gap-3 sm:grid-cols-3">
                {[1, 2, 3].map((n) => (
                  <li key={n} className="rounded-ec-m border border-ec-hair bg-ec-paper p-4">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ec-bronze-tint text-sm font-semibold text-ec-bronze-deep">{n}</span>
                    <p className="mt-2 text-sm text-ec-ink-2">{t(`firstRun.step${n}`)}</p>
                  </li>
                ))}
              </ol>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link href="/dashboard/onboarding" className="ec-btn ec-btn-ink">{t("firstRun.primaryCta")}</Link>
                <Link href="/dashboard/cases" className="ec-btn ec-btn-ghost">{t("firstRun.secondaryCta")}</Link>
              </div>
              <p className="mt-4 flex items-center gap-1.5 text-xs text-ec-ink-3">
                <Icon name="alert" className="h-3.5 w-3.5" /> {t("firstRun.foot")}
              </p>
            </div>
          ) : (
            <div className="ec-card flex flex-col items-center justify-center px-6 py-14 text-center">
              <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-ec-m bg-ec-bronze-tint text-ec-bronze-deep">
                <Icon name="calendar" className="h-5 w-5" />
              </span>
              <h3 className="font-display text-lg font-medium text-ec-ink">{t("empty.title")}</h3>
              <p className="mx-auto mt-1 max-w-xs text-sm text-ec-ink-3">{t("empty.body")}</p>
              <Link href="/dashboard/cases" className="ec-btn ec-btn-ink mt-5">
                <Icon name="plus" className="h-4 w-4" /> {t("empty.addCase")}
              </Link>
            </div>
          )}

          <div className="mb-1.5 mt-10 flex items-end justify-between gap-3">
            <div className="ec-label">{to("sectionDeadlines")}</div>
            <span className="ec-label">{to("deadlines.overdueCount", { count: overdueCount })}</span>
          </div>
          <div className="mb-2 h-[3px] border-y border-ec-hair" />
          {filings.length > 0 ? (
            <ul className="divide-y divide-ec-hair">
              {filings.map((f) => {
                const overdue = !!f.dueDate && f.dueDate.slice(0, 10) < todayIso;
                const dateStr = f.dueDate ? wd(f.dueDate, { day: "numeric", month: "short" }) : "—";
                return (
                  <li key={f.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                    <span className="min-w-0 text-[14px] text-ec-ink">
                      {f.kind ?? t("filing")} — <b className="font-semibold">{f.matterTitle ?? "—"}</b>
                    </span>
                    <span className={`num font-mono text-[11.5px] ${overdue ? "text-ec-danger" : "text-ec-ink-3"}`}>
                      {overdue ? to("deadlines.overdue", { date: dateStr }) : to("deadlines.due", { date: dateStr })}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-3 text-sm text-ec-ink-3">{to("deadlines.empty")}</p>
          )}
        </Reveal>

        {/* right rail */}
        <Reveal delay={180} as="aside" className="min-w-0 space-y-6">
          <Link href="/dashboard/inbox" className="ec-card block p-4 transition-colors hover:bg-ec-bronze-tint/25">
            <div className="ec-label">{to("inbox.eyebrow")}</div>
            <div className="font-display num mt-1 text-[30px] leading-none text-ec-ink">
              <CountUp value={inboxReview} />
            </div>
            <span className="mt-2 inline-flex items-center gap-1 text-[12.5px] text-ec-bronze-deep">
              {to("inbox.cta")} →
            </span>
          </Link>

          <div>
            <div className="ec-label">{to("practice.title")}</div>
            <div className="mb-1.5 mt-1.5 h-[3px] border-y border-ec-hair" />
            <dl className="divide-y divide-ec-hair border-b border-ec-hair">
              <div className="flex items-baseline justify-between py-2.5">
                <dt className="text-[13px] text-ec-ink-2">{to("practice.hearings")}</dt>
                <dd className="font-display num text-[18px] text-ec-ink">
                  <CountUp value={hearingsThisWeek} />
                </dd>
              </div>
              {/* "Filings made" has no reliable backing timestamp in the schema (no filing-event
                  table/column) — kept in the reference's exact slot, rendered honestly-pending
                  rather than a fabricated count (WO-330 founder direction). */}
              <div className="flex items-baseline justify-between py-2.5">
                <dt className="text-[13px] text-ec-ink-2">{to("practice.filings")}</dt>
                <dd className="font-display num text-[18px] text-ec-ink-3" aria-label={to("practice.notTracked")} title={to("practice.notTracked")}>
                  —
                </dd>
              </div>
              <div className="flex items-baseline justify-between py-2.5">
                <dt className="text-[13px] text-ec-ink-2">{to("practice.orders")}</dt>
                <dd className="font-display num text-[18px] text-ec-ink">
                  <CountUp value={ordersThisWeek} />
                </dd>
              </div>
            </dl>
          </div>

          <div>
            <div className="ec-label">{to("lastSync.title")}</div>
            <div className="mb-3 mt-1.5 h-[3px] border-y border-ec-hair" />
            {syncedAt ? (
              <div className="flex justify-start">
                <div className="relative -rotate-2 rounded-[8px] border-[1.5px] border-ec-bronze px-4 pb-2.5 pt-3 text-center text-ec-bronze opacity-75">
                  <span className="absolute left-1/2 top-[5px] h-[5px] w-[5px] -translate-x-1/2 rounded-full bg-ec-honey" />
                  <div className="font-mono text-[10px] uppercase leading-[1.6] tracking-[0.18em]">{to("lastSync.stamp")}</div>
                  <div className="num font-mono text-[10px] uppercase leading-[1.6] tracking-[0.18em]">
                    {wd(syncedAt, { day: "2-digit", month: "short", year: "numeric" })} · {time(syncedAt)}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-ec-ink-3">{to("lastSync.never")}</p>
            )}
          </div>
        </Reveal>
      </div>
    </div>
  );
}
