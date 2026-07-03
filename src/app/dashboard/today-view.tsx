import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Icon } from "@/components/icons";

// Presentational "Today" ledger (Mockup B). Data-driven so it renders from real
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
};

export async function TodayView({ now, week, hearings, courts, syncedAt, filings, inboxReview }: TodayViewProps) {
  const t = await getTranslations("today");
  const locale = await getLocale();
  const wd = (iso: string, opt: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", opt).format(new Date(iso));
  const todayIso = now.slice(0, 10);
  const time = (ts: string | null) => (ts ? wd(ts, { hour: "2-digit", minute: "2-digit" }) : "—");

  return (
    <div className="space-y-4">
      {/* header — vernacular flourish over the localized title */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-display text-sm italic text-ec-brass-deep">{t("overline")}</p>
          <h1 className="font-display text-[1.7rem] font-medium leading-tight tracking-tight text-ec-ink">{t("title")}</h1>
        </div>
        <p className="num text-sm text-ec-ink-3">{wd(now, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
      </header>

      {/* week strip */}
      <div className="num flex flex-wrap gap-2 border-b border-ec-hair pb-4" aria-label={t("weekAria")}>
        {week.map((d) => (
          <div
            key={d.iso}
            aria-current={d.isToday ? "date" : undefined}
            className={`min-w-[64px] rounded-ec-s border px-3 py-1.5 text-center ${
              d.isToday ? "border-ec-brass bg-ec-brass text-white" : "border-ec-hair bg-ec-paper"
            }`}
          >
            <div className={`text-[10px] font-semibold uppercase tracking-wider ${d.isToday ? "text-white" : "text-ec-ink-3"}`}>
              {wd(d.iso, { weekday: "short", timeZone: "UTC" })}
            </div>
            <div className="text-base font-semibold">{Number(d.iso.slice(8, 10))}</div>
            <div className={`text-[10px] ${d.isToday ? "text-white/85" : "text-ec-ink-3"}`}>
              {d.count > 0 ? t("listed", { count: d.count }) : "—"}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_288px]">
        {/* ledger */}
        <section className="min-w-0">
          {hearings.length > 0 ? (
            <>
              <div className="hidden grid-cols-[64px_1.1fr_1.4fr_120px] gap-4 border-b border-ec-hair-strong px-2 pb-1.5 sm:grid">
                <span className="ec-label">{t("ledger.date")}</span>
                <span className="ec-label">{t("ledger.court")}</span>
                <span className="ec-label">{t("ledger.matter")}</span>
                <span className="ec-label text-right">{t("ledger.actions")}</span>
              </div>
              <ul>
                {hearings.map((h) => {
                  const isToday = h.date.slice(0, 10) === todayIso;
                  return (
                    <li key={h.id} className="ec-row grid grid-cols-1 gap-2 border-b border-ec-hair px-2 py-3.5 sm:grid-cols-[64px_1.1fr_1.4fr_120px] sm:items-center sm:gap-4">
                      <div className="num text-ec-brass-deep">
                        <span className="text-2xl font-semibold leading-none">{Number(h.date.slice(8, 10))}</span>
                        <span className="ml-1 text-xs font-semibold uppercase">{wd(h.date, { month: "short", timeZone: "UTC" })}</span>
                      </div>
                      <div className="min-w-0">
                        <b className="block text-[13px] font-semibold leading-snug text-ec-ink">
                          {h.matter?.court ?? h.courtNo ?? "—"}{h.courtNo && h.matter?.court ? ` · ${h.courtNo}` : ""}
                        </b>
                        {h.judge && <span className="block truncate text-xs text-ec-ink-3">{h.judge}</span>}
                      </div>
                      <div className="min-w-0">
                        <Link href={h.matter ? `/dashboard/cases/${h.matter.id}` : "#"} className="block truncate font-display text-[15px] font-medium text-ec-ink hover:text-ec-brass-deep">
                          {h.matter?.title ?? t("hearingFallback")}
                        </Link>
                        <span className="num block truncate text-xs text-ec-ink-3">
                          {h.matter?.cnr ? `${h.matter.cnr} · ` : ""}{h.purpose ? <span className={`ec-chip ${isToday ? "ec-chip-hot" : ""} ml-0`}>{h.purpose}</span> : null}
                        </span>
                      </div>
                      <div className="flex justify-start sm:justify-end">
                        <Link href={h.matter ? `/dashboard/cases/${h.matter.id}` : "#"} className="ec-btn ec-btn-ink text-[13px]">
                          {t("openFile")}
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="num px-2 pt-3 text-xs text-ec-ink-3">
                {t("summary", { count: hearings.length, courts })}
                {syncedAt ? ` · ${t("syncedAt", { time: time(syncedAt) })}` : ""}
              </p>
            </>
          ) : (
            <div className="ec-card flex flex-col items-center justify-center px-6 py-14 text-center">
              <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-ec-m bg-ec-brass-tint text-ec-brass-deep">
                <Icon name="calendar" className="h-5 w-5" />
              </span>
              <h3 className="font-display text-lg font-medium text-ec-ink">{t("empty.title")}</h3>
              <p className="mx-auto mt-1 max-w-xs text-sm text-ec-ink-3">{t("empty.body")}</p>
              <Link href="/dashboard/cases" className="ec-btn ec-btn-ink mt-5">
                <Icon name="plus" className="h-4 w-4" /> {t("empty.addCase")}
              </Link>
            </div>
          )}
        </section>

        {/* right rail */}
        <aside className="flex flex-col gap-4">
          <div className="ec-card overflow-hidden">
            <div className="ec-label flex items-center gap-1.5 border-b border-ec-hair px-4 py-2.5">
              <span className="text-ec-brass-deep">✦</span> {t("glance.title")}
            </div>
            <div className="p-4">
              <p className="num font-display text-[15px] leading-relaxed text-ec-ink-2">
                {t("summary", { count: hearings.length, courts })}.
              </p>
              <Link href="/dashboard/copilot" className="mt-3 inline-block border-b border-ec-brass text-[13px] font-semibold text-ec-brass-deep hover:text-ec-brass">
                {t("glance.openCopilot")} →
              </Link>
            </div>
          </div>

          <div className="ec-card overflow-hidden">
            <div className="ec-label border-b border-ec-hair px-4 py-2.5">{t("filingsDue")}</div>
            <div className="p-4">
              {filings.length > 0 ? (
                <ul>
                  {filings.map((f) => (
                    <li key={f.id} className="flex items-baseline gap-2 border-t border-ec-hair py-1.5 text-[13px] first:border-t-0">
                      <span className="min-w-0 flex-1 truncate text-ec-ink-2">
                        {f.kind ?? t("filing")} — <b className="font-semibold text-ec-ink">{f.matterTitle ?? "—"}</b>
                      </span>
                      <span className="num whitespace-nowrap text-xs font-semibold text-ec-danger">
                        {f.dueDate ? wd(f.dueDate, { day: "numeric", month: "short" }) : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ec-ink-3">{t("noFilings")}</p>
              )}
            </div>
          </div>

          <div className="ec-card overflow-hidden">
            <div className="ec-label border-b border-ec-hair px-4 py-2.5">{t("inbox.title")}</div>
            <div className="p-4">
              <p className="num font-display text-3xl font-semibold text-ec-ink">{inboxReview}</p>
              <p className="mt-1 text-sm text-ec-ink-3">{t("inbox.body")}</p>
              <Link href="/dashboard/inbox" className="ec-btn ec-btn-ghost mt-4 w-full">
                <Icon name="inbox" className="h-4 w-4" /> {t("inbox.open")}
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
