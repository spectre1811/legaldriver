import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader, Card, Badge, EmptyState, fmtDate } from "@/components/ui";
import { Icon } from "@/components/icons";
import { corpusEnabled, searchJudgments, judgmentPdfUrl, courtLabel, type JudgmentRow } from "@/lib/court/corpus-athena";
import { Filters } from "./filters";

export const dynamic = "force-dynamic";

const COURT_RE = /^(SC|[0-9]+_[0-9]+)$/;

// Build the judgment-reader href, omitting any null/empty params.
function judgmentHref(r: JudgmentRow): string {
  const params = new URLSearchParams();
  const add = (k: string, v: string | null | undefined) => { if (v) params.set(k, v); };
  add("cnr", r.cnr);
  add("src", r.src);
  add("court", r.court);
  add("year", r.year);
  add("pdf", r.pdf_link);
  add("title", r.title);
  add("judge", r.judge);
  add("citation", r.citation);
  add("date", r.decision_date);
  add("disposal", r.disposal_nature);
  return `/dashboard/research/judgment?${params.toString()}`;
}

// Title looks like "CR.RA/952/2023 of ARTHKUMAR... Vs BINALBEN...".
// Split on " of " to separate case number from parties, then split parties on a
// "versus" connective to render "X v. Y".
function parseTitle(title: string | null): { caseNumber: string | null; parties: string | null } {
  if (!title) return { caseNumber: null, parties: null };
  const ofIdx = title.search(/\sof\s/i);
  if (ofIdx === -1) return { caseNumber: title.trim() || null, parties: null };
  const caseNumber = title.slice(0, ofIdx).trim() || null;
  const rest = title.slice(ofIdx + 4).trim();
  const vsParts = rest.split(/\s+(?:Vs|Versus|V\/s)\s+/i);
  if (vsParts.length >= 2) {
    const a = vsParts[0].trim();
    const b = vsParts.slice(1).join(" ").trim();
    return { caseNumber, parties: a && b ? `${a} v. ${b}` : rest || null };
  }
  return { caseNumber, parties: rest || null };
}

export default async function ResearchPage({
  searchParams,
}: {
  searchParams: { q?: string; court?: string; year?: string };
}) {
  const { q, court, year } = searchParams;
  const t = await getTranslations("research");

  if (!corpusEnabled()) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t("title")}
          subtitle={t("subtitleNotConfigured")}
        />
        <EmptyState
          icon="scale"
          title={t("notConfiguredTitle")}
          body={t("notConfiguredBody")}
        />
      </div>
    );
  }

  const validCourt = court && COURT_RE.test(court) ? court : undefined;
  const rows = await searchJudgments({
    q,
    court: validCourt,
    year: year ? Number(year) : undefined,
    limit: 100,
  });

  const activeFilters = Boolean(q || court || year);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
      />

      <Filters />

      <p className="flex items-center gap-1.5 text-xs text-ink-faint">
        <Icon name="search" className="h-3.5 w-3.5" />
        {t("searchHint")}
      </p>

      {rows.length ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper/60 px-5 py-3">
            <div className="text-xs text-ink-faint">
              {rows.length}{rows.length === 100 ? "+" : ""} {t("results", { count: rows.length })}
              {activeFilters ? ` · ${t("filtered")}` : ""}
            </div>
            {activeFilters && (
              <a href="/dashboard/research" className="text-xs font-medium text-brand-700 hover:underline">{t("clearFilters")}</a>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="px-5 py-3 label">{t("caseCol")}</th>
                  <th className="px-5 py-3 label">{t("partiesCol")}</th>
                  <th className="hidden px-5 py-3 label lg:table-cell">{t("judgeCol")}</th>
                  <th className="hidden px-5 py-3 label md:table-cell">{t("courtCol")}</th>
                  <th className="hidden px-5 py-3 label sm:table-cell">{t("decidedCol")}</th>
                  <th className="px-5 py-3 label">{t("dispositionCol")}</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const { caseNumber, parties } = parseTitle(r.title);
                  const pdfUrl = judgmentPdfUrl(r.pdf_link, r.court, r.year, r.src);
                  return (
                    <tr key={r.cnr ?? `${r.title}-${i}`} className="border-b border-line last:border-0 hover:bg-paper">
                      <td className="px-5 py-3.5 align-top">
                        <Link href={judgmentHref(r)} className="group flex flex-col leading-tight">
                          <span className="flex items-center gap-2 font-medium text-ink group-hover:text-brand-700 group-hover:underline">
                            <Icon name="cases" className="h-4 w-4 shrink-0 text-ink-faint" />
                            {caseNumber ?? r.title ?? "—"}
                          </span>
                          {r.cnr && <span className="mt-0.5 pl-6 text-xs text-ink-faint">CNR {r.cnr}</span>}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 align-top text-ink-muted">
                        {parties ? <span className="font-medium text-ink">{parties}</span> : <span className="text-ink-faint">—</span>}
                      </td>
                      <td className="hidden px-5 py-3.5 align-top text-ink-muted lg:table-cell">{r.judge ? <Link href={`/api/court/judge?name=${encodeURIComponent(r.judge)}`} className="hover:text-brand-600 hover:underline">{r.judge}</Link> : <span className="text-ink-faint">—</span>}</td>
                      <td className="hidden px-5 py-3.5 align-top text-xs text-ink-faint md:table-cell">{courtLabel(r.court)}</td>
                      <td className="hidden px-5 py-3.5 align-top text-xs text-ink-faint sm:table-cell">
                        {fmtDate(r.decision_date)}
                        {r.year && !r.decision_date ? <span>{r.year}</span> : null}
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        {r.disposal_nature ? <Badge>{r.disposal_nature}</Badge> : <span className="text-ink-faint">—</span>}
                      </td>
                      <td className="px-5 py-3.5 align-top text-right">
                        {pdfUrl ? (
                          <a
                            href={pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:underline"
                          >
                            PDF
                            <Icon name="external" className="h-3.5 w-3.5" />
                          </a>
                        ) : (
                          <span className="text-xs text-ink-faint">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <EmptyState
          icon="scale"
          title={activeFilters ? t("noMatchTitle") : t("emptyTitle")}
          body={activeFilters ? t("noMatchBody") : t("emptyBody")}
        />
      )}

      <p className="flex items-start gap-1.5 text-xs text-ink-faint">
        <Icon name="alert" className="mt-px h-3.5 w-3.5 shrink-0" />
        {t("sourceListing")}
      </p>
    </div>
  );
}
