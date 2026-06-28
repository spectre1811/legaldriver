import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Badge, EmptyState, fmtDate } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Filters } from "./filters";

const PDF_BASE = "https://indian-high-court-judgments.s3.amazonaws.com";

function parties(petitioner: string | null, respondent: string | null) {
  const p = petitioner?.trim();
  const r = respondent?.trim();
  if (p && r) return `${p} v. ${r}`;
  return p || r || null;
}

export default async function ResearchPage({
  searchParams,
}: {
  searchParams: { q?: string; court?: string; year?: string; disposal?: string; sort?: string };
}) {
  const supabase = createClient();
  const { q, court, year, disposal, sort } = searchParams;

  let query = supabase
    .from("corpus_judgment")
    .select("id, court, cnr, case_number, title, petitioner, respondent, judge, year, decision_date, disposal_nature, pdf_link");

  if (sort === "year") query = query.order("year", { ascending: false, nullsFirst: false });
  else query = query.order("decision_date", { ascending: false, nullsFirst: false });
  query = query.limit(100);

  if (q) query = query.textSearch("fts", q, { type: "websearch" });
  if (court) query = query.eq("court", court);
  if (year) query = query.eq("year", Number(year));
  if (disposal) query = query.eq("disposal_nature", disposal);

  // Distinct option lists from a bounded sample (the corpus is 250k+ rows, so we
  // never scan the whole table — just enough to surface the common values).
  const [{ data: rows }, { data: courtRows }, { data: yearRows }, { data: dispRows }] = await Promise.all([
    query,
    supabase.from("corpus_judgment").select("court").not("court", "is", null).limit(2000),
    supabase.from("corpus_judgment").select("year").not("year", "is", null).limit(2000),
    supabase.from("corpus_judgment").select("disposal_nature").not("disposal_nature", "is", null).limit(2000),
  ]);

  const courts = [...new Set((courtRows ?? []).map((r) => r.court).filter(Boolean) as string[])]
    .sort()
    .map((c) => ({ value: c, label: c }));
  const years = [...new Set((yearRows ?? []).map((r) => r.year).filter((y): y is number => y != null))]
    .sort((a, b) => b - a)
    .map((y) => ({ value: String(y), label: String(y) }));
  const disposals = [...new Set((dispRows ?? []).map((r) => r.disposal_nature).filter(Boolean) as string[])]
    .sort()
    .map((d) => ({ value: d, label: d }));

  const activeFilters = Boolean(q || court || year || disposal || sort);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Case Research"
        subtitle="Search a 250,000+ judgment corpus from India's High Courts by party, case number, judge, court, or year."
      />

      <Filters courts={courts} years={years} disposals={disposals} />

      <p className="flex items-center gap-1.5 text-xs text-ink-faint">
        <Icon name="search" className="h-3.5 w-3.5" />
        Search matches parties, case number, and judge. Full-text search of the judgment itself is coming later.
      </p>

      {rows && rows.length ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper/60 px-5 py-3">
            <div className="text-xs text-ink-faint">
              {rows.length}{rows.length === 100 ? "+" : ""} judgment{rows.length === 1 ? "" : "s"}
              {activeFilters ? " · filtered" : ""}
            </div>
            {activeFilters && (
              <a href="/dashboard/research" className="text-xs font-medium text-brand-700 hover:underline">Clear filters</a>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="px-5 py-3 label">Case</th>
                  <th className="px-5 py-3 label">Parties</th>
                  <th className="hidden px-5 py-3 label lg:table-cell">Judge</th>
                  <th className="hidden px-5 py-3 label md:table-cell">Court</th>
                  <th className="hidden px-5 py-3 label sm:table-cell">Decided</th>
                  <th className="px-5 py-3 label">Disposition</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const p = parties(r.petitioner, r.respondent);
                  return (
                    <tr key={r.id} className="border-b border-line last:border-0 hover:bg-paper">
                      <td className="px-5 py-3.5 align-top">
                        <span className="flex flex-col leading-tight">
                          <span className="flex items-center gap-2 font-medium text-ink">
                            <Icon name="cases" className="h-4 w-4 shrink-0 text-ink-faint" />
                            {r.case_number ?? r.title ?? "—"}
                          </span>
                          {r.cnr && <span className="mt-0.5 pl-6 text-xs text-ink-faint">CNR {r.cnr}</span>}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 align-top text-ink-muted">
                        {p ? <span className="font-medium text-ink">{p}</span> : <span className="text-ink-faint">—</span>}
                      </td>
                      <td className="hidden px-5 py-3.5 align-top text-ink-muted lg:table-cell">{r.judge ?? <span className="text-ink-faint">—</span>}</td>
                      <td className="hidden px-5 py-3.5 align-top text-xs text-ink-faint md:table-cell">{r.court ?? "—"}</td>
                      <td className="hidden px-5 py-3.5 align-top text-xs text-ink-faint sm:table-cell">
                        {fmtDate(r.decision_date)}
                        {r.year && !r.decision_date ? <span>{r.year}</span> : null}
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        {r.disposal_nature ? <Badge>{r.disposal_nature}</Badge> : <span className="text-ink-faint">—</span>}
                      </td>
                      <td className="px-5 py-3.5 align-top text-right">
                        {r.pdf_link ? (
                          <a
                            href={`${PDF_BASE}/${r.pdf_link}`}
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
          title={activeFilters ? "No matching judgments" : "Search the judgment corpus"}
          body={activeFilters ? "Try a different search or clear the filters." : "Search by party name, case number, or judge — or filter by court and year."}
        />
      )}

      <p className="flex items-start gap-1.5 text-xs text-ink-faint">
        <Icon name="alert" className="mt-px h-3.5 w-3.5 shrink-0" />
        Source: Indian High Court Judgments — AWS Open Data, CC-BY 4.0. Reference only; not legal advice — verify against the official record.
      </p>
    </div>
  );
}
