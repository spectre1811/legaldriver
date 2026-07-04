import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { TrackCaseButton } from "@/components/track-case-button";
import { searchAdvocates, searchJudges, searchParties, searchByCaseNumber, getStats, ldEnabled } from "@/lib/court/legaldriver-api";

export const dynamic = "force-dynamic";

// Search the live court corpus by name — advocates, judges, and parties/litigants —
// or directly by registration case number (type/number/year). The case-number path
// is the core lawyer expectation the API supported but no UI reached (WO-35 #7).
export default async function LookupPage({
  searchParams,
}: {
  searchParams: { q?: string; ct?: string; cn?: string; cy?: string };
}) {
  const t = await getTranslations("lookup");
  const q = (searchParams.q ?? "").trim();
  const cnType = (searchParams.ct ?? "").trim();
  const cnNumber = (searchParams.cn ?? "").trim();
  const cnYear = (searchParams.cy ?? "").trim();
  const cnActive = Boolean(cnNumber && cnYear);
  const enabled = ldEnabled();
  const cnResults = enabled && cnActive
    ? await searchByCaseNumber(cnType, cnNumber, cnYear).catch(() => [])
    : [];
  const [advocates, judges, parties, stats] = enabled && q.length >= 2
    ? await Promise.all([searchAdvocates(q).catch(() => []), searchJudges(q).catch(() => []), searchParties(q).catch(() => []), getStats().catch(() => null)])
    : [[], [], [], enabled ? await getStats().catch(() => null) : null];

  const coverage = stats
    ? t("coverage", {
        total: stats.cases_total.toLocaleString("en-IN"),
        district: (stats.by_tier?.DISTRICT ?? 0).toLocaleString("en-IN"),
        high: (stats.by_tier?.HIGH ?? 0).toLocaleString("en-IN"),
      })
    : undefined;

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <Card className="p-5">
        <form method="get" className="flex flex-wrap items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-line px-3">
            <Icon name="search" className="h-4 w-4 text-ink-faint" />
            <input name="q" defaultValue={q} placeholder={t("placeholder")} className="min-w-40 flex-1 bg-transparent py-2.5 text-sm outline-none" autoFocus />
          </div>
          <button type="submit" className="btn-primary">{t("search")}</button>
        </form>
        {!enabled ? <p className="mt-3 text-xs text-amber-700">{t("notConfigured")}</p>
          : coverage && <p className="mt-3 text-xs text-ink-faint">{coverage}</p>}
      </Card>

      {enabled && (
        <Card className="p-5">
          <h2 className="text-sm font-medium text-ink">{t("caseNumber.title")}</h2>
          <p className="mt-0.5 text-xs text-ink-faint">{t("caseNumber.subtitle")}</p>
          <form method="get" className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-faint">{t("caseNumber.typeLabel")}</span>
              <input name="ct" defaultValue={cnType} placeholder={t("caseNumber.typePlaceholder")} className="w-40 rounded-xl border border-line px-3 py-2 text-sm uppercase outline-none" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-faint">{t("caseNumber.numberLabel")}</span>
              <input name="cn" defaultValue={cnNumber} required placeholder={t("caseNumber.numberPlaceholder")} className="w-32 rounded-xl border border-line px-3 py-2 font-mono text-sm outline-none" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-faint">{t("caseNumber.yearLabel")}</span>
              <input name="cy" defaultValue={cnYear} required inputMode="numeric" placeholder={t("caseNumber.yearPlaceholder")} className="w-24 rounded-xl border border-line px-3 py-2 font-mono text-sm outline-none" />
            </label>
            <button type="submit" className="btn-secondary">{t("caseNumber.search")}</button>
          </form>

          {cnActive && (
            <div className="mt-4 border-t border-line pt-4">
              {cnResults.length ? (
                <ul className="divide-y divide-line">
                  {cnResults.slice(0, 25).map((p, i) => (
                    <li key={`${p.cnr}-${i}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium text-ink">{p.name || p.cnr}</span>
                        <span className="ml-2 font-mono text-[0.7rem] text-ink-faint">{p.cnr}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {p.side && <Badge tone={/pet|appl|compl/i.test(p.side) ? "green" : "neutral"}>{p.side.toLowerCase()}</Badge>}
                        <span className="hidden text-xs text-ink-faint sm:inline">{p.case_type}</span>
                        <TrackCaseButton cnr={p.cnr} />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState icon="search" title={t("caseNumber.noResults")} body={t("caseNumber.noResultsBody")} />}
            </div>
          )}
        </Card>
      )}

      {q.length >= 2 && (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <div className="border-b border-line px-5 py-4"><h2 className="text-base font-medium">{t("advocates")} <span className="text-ink-faint">({advocates.length})</span></h2></div>
              {advocates.length ? (
                <ul className="divide-y divide-line">
                  {advocates.slice(0, 25).map((a, i) => (
                    <li key={(a.bar_id ?? "") + i} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                      {a.bar_id ? <Link href={`/dashboard/advocate/${a.bar_id}`} className="min-w-0 flex-1 truncate font-medium text-brand-600 hover:underline">{a.name_raw}</Link> : <span className="min-w-0 flex-1 truncate text-ink">{a.name_raw}</span>}
                      <span className="shrink-0 text-xs text-ink-faint">{t("casesCount", { n: a.cases })}{a.bar_id ? t("barSuffix", { id: a.bar_id }) : t("noBar")}</span>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState icon="scale" title={t("noAdvocates")} />}
            </Card>

            <Card>
              <div className="border-b border-line px-5 py-4"><h2 className="text-base font-medium">{t("judges")} <span className="text-ink-faint">({judges.length})</span></h2></div>
              {judges.length ? (
                <ul className="divide-y divide-line">
                  {judges.slice(0, 25).map((j) => (
                    <li key={j.judge_id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                      <Link href={`/dashboard/judge/${j.judge_id}`} className="min-w-0 flex-1 truncate font-medium text-brand-600 hover:underline">{j.name_raw}</Link>
                      <span className="shrink-0 text-xs text-ink-faint">{t("casesCount", { n: j.cases })}</span>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState icon="scale" title={t("noJudges")} />}
            </Card>
          </div>

          <Card>
            <div className="border-b border-line px-5 py-4"><h2 className="text-base font-medium">{t("parties")} <span className="text-ink-faint">({parties.length})</span></h2></div>
            {parties.length ? (
              <ul className="divide-y divide-line">
                {parties.slice(0, 30).map((p, i) => (
                  <li key={p.cnr + i} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium text-ink">{p.name}</span>
                      <span className="ml-2 font-mono text-[0.7rem] text-ink-faint">{p.cnr}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {p.side && <Badge tone={/pet|appl|compl/i.test(p.side) ? "green" : "neutral"}>{p.side.toLowerCase()}</Badge>}
                      <span className="hidden text-xs text-ink-faint sm:inline">{p.case_type}</span>
                      <TrackCaseButton cnr={p.cnr} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : <EmptyState icon="search" title={t("noParties")} body={t("noPartiesBody")} />}
          </Card>
        </>
      )}
      {q.length >= 2 && <p className="text-xs text-ink-faint">{t("footer")}</p>}
    </div>
  );
}
