import Link from "next/link";
import { PageHeader, Card, Badge, EmptyState, Disclaimer, fmtDate } from "@/components/ui";
import { Icon } from "@/components/icons";
import { judgmentPdfUrl, courtLabel } from "@/lib/court/corpus-athena";

export const dynamic = "force-dynamic";

// Title looks like "CR.RA/952/2023 of ARTHKUMAR... Vs BINALBEN...".
// Split on " of " to separate case number from parties, then split parties on a
// "versus" connective to render "X v. Y" (mirrors the research listing page).
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

// Dates arrive either as dd-mm-yyyy (corpus) or ISO; otherwise show the raw string.
function readableDate(d?: string): string | null {
  if (!d) return null;
  const dmy = d.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmy) return fmtDate(`${dmy[3]}-${dmy[2]}-${dmy[1]}`);
  const iso = new Date(d);
  if (!Number.isNaN(iso.getTime())) return fmtDate(d);
  return d;
}

export default async function JudgmentReaderPage({
  searchParams,
}: {
  searchParams: {
    cnr?: string; src?: string; court?: string; year?: string; pdf?: string;
    title?: string; judge?: string; citation?: string; date?: string; disposal?: string;
  };
}) {
  const { cnr, src, court, year, pdf, title, judge, citation, date, disposal } = searchParams;

  const pdfUrl = judgmentPdfUrl(pdf, court, year, src);
  const cacheKey = cnr || pdf || title || "";

  const { caseNumber, parties } = parseTitle(title ?? null);
  const decided = readableDate(date);

  // Extract on demand; never let extraction failures 500 the page.
  let result: { text: string; cached: boolean; needsOcr?: boolean } | null = null;
  let extractError = false;
  try {
    const { getJudgmentText } = await import("@/lib/court/judgment-text");
    result = await getJudgmentText({ pdfUrl, cacheKey });
  } catch {
    extractError = true;
  }

  const text = result?.text?.trim() ?? "";
  const hasText = Boolean(text) && !result?.needsOcr;

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/research"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
      >
        <Icon name="back" className="h-4 w-4" />
        Back to research
      </Link>

      <PageHeader
        title={caseNumber ?? title ?? "Judgment"}
        subtitle={parties ?? undefined}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="brand">{courtLabel(court)}</Badge>
        {year && <Badge>{year}</Badge>}
        {decided && <Badge>{decided}</Badge>}
        {citation && <Badge tone="amber">{citation}</Badge>}
        {disposal && <Badge tone="green">{disposal}</Badge>}
        {judge && (
          <span className="flex items-center gap-1.5 text-xs text-ink-faint">
            <Icon name="scale" className="h-3.5 w-3.5" />
            {judge}
          </span>
        )}
      </div>

      {pdfUrl && (
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl border border-line bg-paper/60 px-4 py-2.5 text-sm font-medium text-brand-700 transition hover:bg-paper hover:shadow-lift"
        >
          <Icon name="external" className="h-4 w-4" />
          Open original PDF (CC-BY open data)
        </a>
      )}

      {hasText ? (
        <Card className="p-0">
          <div className="flex items-center gap-1.5 border-b border-line bg-paper/60 px-5 py-3 text-xs text-ink-faint">
            <Icon name="documents" className="h-3.5 w-3.5" />
            Full text extracted from the open-data PDF
            {result?.cached ? " · cached" : " · freshly extracted"}
          </div>
          <div className="max-h-[70vh] overflow-auto px-6 py-6 sm:px-8">
            <article className="whitespace-pre-wrap font-serif text-[0.95rem] leading-7 text-ink">
              {text}
            </article>
          </div>
        </Card>
      ) : (
        <EmptyState
          icon="alert"
          title={extractError ? "Couldn't load this judgment's text" : "Text not available"}
          body="This judgment's text couldn't be extracted (it may be a scanned image). Open the original PDF above."
        />
      )}

      <Disclaimer />
      <p className="flex items-start gap-1.5 text-xs text-ink-faint">
        <Icon name="alert" className="mt-px h-3.5 w-3.5 shrink-0" />
        Source: Indian Court Judgments (AWS Open Data, CC-BY 4.0). Reference only — not legal advice; verify against the certified copy.
      </p>
    </div>
  );
}
