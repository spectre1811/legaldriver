import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader, Card, Badge, EmptyState, fmtDate } from "@/components/ui";
import { Icon } from "@/components/icons";
import { createClient } from "@/lib/supabase/server";
import { corpusEnabled, searchJudgments, judgmentPdfUrl, courtLabel, type JudgmentRow } from "@/lib/court/corpus-athena";
import { expandDisposal } from "@/lib/court/code-labels";
import { Filters } from "./filters";

export const dynamic = "force-dynamic";

const COURT_RE = /^(SC|[0-9]+_[0-9]+)$/;
// disposal values come from URL; allow only known safe labels (alpha + spaces) to prevent injection.
const DISPOSAL_RE = /^[A-Za-z\s]{1,40}$/;

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
  return `/dashboard/search/judgments/judgment?${params.toString()}`;
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

// Truncate long advocate names cleanly.
function truncate(s: string | null, max = 32): string {
  if (!s) return "—";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// Check if a judgment row shares CNR or parties with tracked matters.
// Returns the matter title if related, null otherwise.
function relatesToMatter(
  r: JudgmentRow,
  matters: Array<{ cnr: string | null; title: string; partyNames: string[] }>,
): string | null {
  if (!matters.length) return null;
  // CNR match is definitive.
  if (r.cnr) {
    const byC = matters.find((m) => m.cnr && m.cnr === r.cnr);
    if (byC) return byC.title;
  }
  // Party name substring match: if the judgment's title contains any tracked party name (5+ chars).
  const titleLower = (r.title ?? "").toLowerCase();
  for (const m of matters) {
    for (const name of m.partyNames) {
      if (name.length >= 5 && titleLower.includes(name.toLowerCase())) return m.title;
    }
  }
  return null;
}

export default async function ResearchPage({
  searchParams,
}: {
  searchParams: { q?: string; court?: string; year?: string; disposal?: string; judge?: string };
}) {
  const { q, court, year, disposal, judge } = searchParams;
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
  const validDisposal = disposal && DISPOSAL_RE.test(disposal) ? disposal : undefined;
  const validJudge = judge?.trim() || undefined;

  // Fetch judgments + tenant's tracked matters in parallel.
  const supabase = createClient();
  const [rows, { data: mattersData }] = await Promise.all([
    searchJudgments({
      q,
      court: validCourt,
      year: year ? Number(year) : undefined,
      disposal: validDisposal,
      judgeFilter: validJudge,
      limit: 100,
    }),
    supabase.from("matter").select("cnr, title, party_names").order("title"),
  ]);

  // Build a lightweight matter index for cross-link detection.
  // party_names is string[] — confirmed in DB schema. Use for substring match.
  const matters = (mattersData ?? []).map((m) => ({
    cnr: (m as { cnr?: string | null }).cnr as string | null,
    title: m.title as string,
    partyNames: (m as { party_names?: string[] }).party_names ?? [],
  }));

  const activeFilters = Boolean(q || court || year || disposal || judge);

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
              <a href="/dashboard/search/judgments" className="text-xs font-medium text-brand-700 hover:underline">{t("clearFilters")}</a>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="px-5 py-3 label">{t("caseCol")}</th>
                  <th className="px-5 py-3 label">{t("partiesCol")}</th>
                  <th className="hidden px-5 py-3 label xl:table-cell">{t("petAdvCol")}</th>
                  <th className="hidden px-5 py-3 label xl:table-cell">{t("resAdvCol")}</th>
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
                  const relatedMatter = relatesToMatter(r, matters);
                  return (
                    <tr key={`${r.cnr ?? r.title ?? "row"}-${i}`} className={`border-b border-line last:border-0 hover:bg-paper ${relatedMatter ? "bg-brand-50/30" : ""}`}>
                      <td className="px-5 py-3.5 align-top">
                        <Link href={judgmentHref(r)} className="group flex flex-col leading-tight">
                          <span className="flex items-center gap-2 font-medium text-ink group-hover:text-brand-700 group-hover:underline">
                            <Icon name="cases" className="h-4 w-4 shrink-0 text-ink-faint" />
                            {caseNumber ?? r.title ?? "—"}
                          </span>
                          {r.cnr && <span className="mt-0.5 pl-6 text-xs text-ink-faint">CNR {r.cnr}</span>}
                          {relatedMatter && (
                            <span className="mt-1 pl-6 inline-flex items-center gap-1 text-xs font-medium text-brand-700">
                              <Icon name="cases" className="h-3 w-3 shrink-0" />
                              {t("relatedToMatter", { matter: relatedMatter })}
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 align-top text-ink-muted">
                        {parties ? <span className="font-medium text-ink">{parties}</span> : <span className="text-ink-faint">—</span>}
                      </td>
                      <td className="hidden px-5 py-3.5 align-top text-xs text-ink-muted xl:table-cell">
                        {truncate(r.petitioner)}
                      </td>
                      <td className="hidden px-5 py-3.5 align-top text-xs text-ink-muted xl:table-cell">
                        {truncate(r.respondent)}
                      </td>
                      <td className="hidden px-5 py-3.5 align-top text-ink-muted lg:table-cell">
                        {r.judge
                          ? <button
                              type="button"
                              onClick={undefined}
                              className="hover:text-brand-600 hover:underline text-left"
                              aria-label={`Filter by judge ${r.judge}`}
                            >
                              <a href={`/dashboard/search/judgments?judge=${encodeURIComponent(r.judge)}`} className="hover:text-brand-600 hover:underline">{r.judge}</a>
                            </button>
                          : <span className="text-ink-faint">—</span>}
                      </td>
                      <td className="hidden px-5 py-3.5 align-top text-xs text-ink-faint md:table-cell">{courtLabel(r.court)}</td>
                      <td className="hidden px-5 py-3.5 align-top text-xs text-ink-faint sm:table-cell">
                        {fmtDate(r.decision_date)}
                        {r.year && !r.decision_date ? <span>{r.year}</span> : null}
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        {r.disposal_nature
                          ? <a href={`/dashboard/search/judgments?disposal=${encodeURIComponent(r.disposal_nature)}`} title={t("filterByDisposal")} className="hover:opacity-70 transition-opacity">
                              <Badge>{expandDisposal(r.disposal_nature).full}</Badge>
                            </a>
                          : <span className="text-ink-faint">—</span>}
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
