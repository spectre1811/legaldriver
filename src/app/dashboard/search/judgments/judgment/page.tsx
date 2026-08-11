import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatCourtDate } from "@/components/court";
import { Icon } from "@/components/icons";
import { judgmentPdfUrl, courtLabel, caseDetailByCnr } from "@/lib/court/corpus-athena";

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

// Dates arrive either as dd-mm-yyyy (corpus) or ISO — formatCourtDate parses both,
// day-first (the kit's canonical parser). Unparseable → show the raw string.
function readableDate(d?: string): string | null {
  if (!d) return null;
  return formatCourtDate(d) ?? d;
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
  const t = await getTranslations("research");

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

  // Rich detail (advocates, acts/sections) where the open case-details set covers it.
  let detail: Awaited<ReturnType<typeof caseDetailByCnr>> = null;
  try { detail = await caseDetailByCnr(cnr); } catch { /* best-effort */ }
  const hasDetail = Boolean(detail && (detail.pet_advocate || detail.res_advocate || detail.acts));

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/search/judgments"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ec-bronze-deep hover:underline"
      >
        <Icon name="back" className="h-4 w-4" />
        {t("backToResearch")}
      </Link>

      <header>
        <h1 className="font-display text-[1.6rem] font-medium leading-tight tracking-tight text-ec-ink">{caseNumber ?? title ?? t("judgmentFallback")}</h1>
        {parties && <p className="mt-1 text-sm text-ec-ink-2">{parties}</p>}
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <span className="ec-chip ec-chip-hot">{courtLabel(court)}</span>
        {year && <span className="ec-chip num">{year}</span>}
        {decided && <span className="ec-chip num">{decided}</span>}
        {citation && <span className="ec-chip">{citation}</span>}
        {disposal && <span className="ec-chip ec-chip-success">{disposal}</span>}
        {judge && (
          <Link href={`/api/court/judge?name=${encodeURIComponent(judge)}`} className="flex items-center gap-1.5 text-xs text-ec-ink-3 hover:text-ec-bronze-deep">
            <Icon name="scale" className="h-3.5 w-3.5" />
            {judge}
          </Link>
        )}
      </div>

      {pdfUrl && (
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ec-btn ec-btn-ghost"
        >
          <Icon name="external" className="h-4 w-4" />
          {t("openPdf")}
        </a>
      )}

      {hasDetail && detail && (
        <div className="ec-card p-5">
          <div className="mb-3 flex items-center gap-2"><Icon name="scale" className="h-4 w-4 text-ec-bronze" /><h2 className="text-base font-medium text-ec-ink">{t("advocatesActs")}</h2></div>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {detail.pet_advocate && <div><dt className="ec-label">{t("petitionerAdvocate")}</dt><dd className="mt-0.5"><Link href={`/api/court/advocate?name=${encodeURIComponent(detail.pet_advocate)}`} className="text-ec-bronze-deep hover:underline">{detail.pet_advocate}</Link></dd></div>}
            {detail.res_advocate && <div><dt className="ec-label">{t("respondentAdvocate")}</dt><dd className="mt-0.5"><Link href={`/api/court/advocate?name=${encodeURIComponent(detail.res_advocate)}`} className="text-ec-bronze-deep hover:underline">{detail.res_advocate}</Link></dd></div>}
            {detail.acts && <div className="sm:col-span-2"><dt className="ec-label">{t("actsSections")}</dt><dd className="mt-0.5 text-ec-ink">{detail.acts}</dd></div>}
            {detail.fir_no && <div><dt className="ec-label">{t("fir")}</dt><dd className="mt-0.5 text-ec-ink num">{detail.fir_no}{detail.fir_year ? `/${detail.fir_year}` : ""}</dd></div>}
            {detail.lower_court && <div><dt className="ec-label">{t("lowerCourt")}</dt><dd className="mt-0.5 text-ec-ink">{detail.lower_court}</dd></div>}
          </dl>
        </div>
      )}

      {hasText ? (
        <div className="ec-card overflow-hidden">
          <div className="flex items-center gap-1.5 border-b border-ec-hair bg-ec-paper-3 px-5 py-3 text-xs text-ec-ink-2">
            <Icon name="documents" className="h-3.5 w-3.5" />
            {t("fullTextExtracted")}
            {result?.cached ? ` · ${t("cached")}` : ` · ${t("freshlyExtracted")}`}
          </div>
          <div className="max-h-[70vh] overflow-auto px-6 py-6 sm:px-8">
            <article className="whitespace-pre-wrap font-serif text-[0.95rem] leading-7 text-ec-ink">
              {text}
            </article>
          </div>
        </div>
      ) : (
        <div className="ec-card flex flex-col items-center justify-center px-6 py-14 text-center">
          <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-ec-s bg-ec-warn-t text-ec-warn">
            <Icon name="alert" className="h-5 w-5" />
          </span>
          <h3 className="font-display text-lg font-medium text-ec-ink">{extractError ? t("loadErrorTitle") : t("textNotAvailableTitle")}</h3>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-ec-ink-2">{t("textNotAvailableBody")}</p>
        </div>
      )}

      <p className="flex items-start gap-1.5 text-xs text-ec-ink-3">
        <Icon name="alert" className="mt-px h-3.5 w-3.5 shrink-0" />
        {t("sourceJudgment")}
      </p>
    </div>
  );
}
