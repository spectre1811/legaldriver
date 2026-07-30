import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatCourtDate } from "@/components/court";
import { Icon } from "@/components/icons";
import { createClient } from "@/lib/supabase/server";
import { searchOrderText, ldEnabled, type OrderTextHit } from "@/lib/court/legaldriver-api";
import { caseDetailHref } from "@/lib/court/case-links";
import { expandCaseType } from "@/lib/court/code-labels";
import { Filters } from "./filters";

export const dynamic = "force-dynamic";

// WO-289 · Judgments/Case Research, migrated off the Athena-backed "every Indian High Court" open-
// data lake (2 lake-scans + an unbounded Supabase read per render, no loading.tsx, 30s poll) onto
// `/search/order-text` — BM25 full-text search over OUR OWN ingested order/judgment text, on the
// SAME keyed data plane as the rest of the console (~72ms warm). This narrows the feature's scope:
// it now searches only what we've ingested (not the full India-wide open corpus), and the endpoint
// is a bounded top-K search (no court/year/disposal facets, no offset/total) — an honest trade for
// zero Athena in the render path. Zero-Athena is asserted by tests/wo72_judgments_pagination.ts.

// A search too heavy for the engine surfaces as a 503 (WO-215/WO-266 pattern, thrown by the
// strict searchOrderText) — caught here so the page renders an honest error state, never a
// silent empty.
async function runSearch(q: string): Promise<{ rows: OrderTextHit[]; error: boolean }> {
  try {
    return { rows: await searchOrderText(q, 50), error: false };
  } catch {
    return { rows: [], error: true };
  }
}

// Title-ish identity for a row: the registration number when we have it, else the bare CNR.
function caseLabel(r: OrderTextHit): string {
  return r.registration_number?.trim() || r.cnr;
}

// ts_headline/paradedb.snippet wrap matched terms in <b>…</b> — strip tags rather than render them
// (dangerouslySetInnerHTML is unwarranted risk/complexity for a nice-to-have highlight; plain text
// with the terms visible, unbolded, still tells the user why the row matched).
function plainSnippet(s?: string | null): string {
  return (s ?? "").replace(/<\/?[^>]+>/g, "");
}

// DS-v2 empty/not-configured/error state — sand icon well, serif title.
function EmptyPanel({ icon, title, body }: { icon: "scale" | "alert" | "search"; title: string; body?: string }) {
  return (
    <div className="ec-card flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-ec-s bg-ec-paper-3 text-ec-bronze">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <h3 className="font-display text-lg font-medium text-ec-ink">{title}</h3>
      {body && <p className="mx-auto mt-1.5 max-w-md text-sm text-ec-ink-2">{body}</p>}
    </div>
  );
}

export default async function ResearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const q = (searchParams.q ?? "").trim();
  const t = await getTranslations("research");
  const enabled = ldEnabled();

  const header = (subtitle: string) => (
    <header>
      <h1 className="font-display text-[1.6rem] font-medium leading-tight tracking-tight text-ec-ink">{t("title")}</h1>
      <p className="mt-1 text-sm text-ec-ink-2">{subtitle}</p>
    </header>
  );

  if (!enabled) {
    return (
      <div className="space-y-6">
        {header(t("subtitleNotConfigured"))}
        <EmptyPanel icon="scale" title={t("notConfiguredTitle")} body={t("notConfiguredBody")} />
      </div>
    );
  }

  // /search/order-text requires min_length=3 — below that, show the empty/starting-point state
  // without querying (mirrors the directory page's q.length>=2 gate).
  const searchActive = q.length >= 3;
  const [{ rows, error }, mattersRes] = await Promise.all([
    searchActive ? runSearch(q) : Promise.resolve({ rows: [] as OrderTextHit[], error: false }),
    // Bounded (WO-289: this was an unbounded `select(...)` over the whole tenant matter table on
    // every render) — only cnr is needed for the cross-link check below.
    createClient().from("matter").select("cnr").limit(2000),
  ]);
  const trackedCnrs = new Set((mattersRes.data ?? []).map((m) => (m as { cnr?: string | null }).cnr).filter(Boolean) as string[]);

  return (
    <div className="space-y-6">
      {header(t("subtitle"))}

      <Filters />

      <p className="flex items-center gap-1.5 text-xs text-ec-ink-3">
        <Icon name="search" className="h-3.5 w-3.5" />
        {t("searchHint")}
      </p>

      {!searchActive ? (
        <EmptyPanel icon="scale" title={t("emptyTitle")} body={t("emptyBody")} />
      ) : error ? (
        <EmptyPanel icon="alert" title={t("searchErrorTitle")} body={t("searchErrorBody")} />
      ) : rows.length ? (
        <div className="ec-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ec-hair bg-ec-paper-3 px-5 py-3">
            <div className="text-xs text-ec-ink-2">
              <span className="num font-medium text-ec-ink">{rows.length}</span> {t("results", { count: rows.length })}
            </div>
            <a href="/dashboard/search/judgments" className="text-xs font-medium text-ec-bronze-deep hover:underline">{t("clearFilters")}</a>
          </div>
          <ul className="divide-y divide-ec-hair">
            {rows.map((r, i) => {
              const ct = expandCaseType(r.case_type ?? undefined, r.tier ?? undefined);
              const related = r.cnr && trackedCnrs.has(r.cnr);
              return (
                <li key={`${r.cnr}-${i}`} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <Link href={caseDetailHref(r.cnr)} className="group min-w-0 flex-1">
                      <span className="flex items-center gap-2 font-medium text-ec-ink group-hover:text-ec-bronze-deep group-hover:underline">
                        <Icon name="cases" className="h-4 w-4 shrink-0 text-ec-ink-3" />
                        {caseLabel(r)}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 pl-6 text-xs text-ec-ink-3">
                        <span className="num">CNR {r.cnr}</span>
                        {ct.full && <span>· {ct.full}</span>}
                        {r.court_name && <span>· {r.court_name}{r.bench_label ? ` (${r.bench_label})` : ""}</span>}
                        {related && (
                          <span className="inline-flex items-center gap-1 font-medium text-ec-bronze-deep">
                            <Icon name="cases" className="h-3 w-3 shrink-0" /> {t("trackedBadge")}
                          </span>
                        )}
                      </span>
                    </Link>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {r.status && <span className="ec-chip">{r.status}</span>}
                      {r.order_date && <span className="ec-chip num">{formatCourtDate(r.order_date) ?? r.order_date}</span>}
                    </div>
                  </div>
                  {(r.snippet || r.description) && (
                    <p className="mt-2 pl-6 text-sm text-ec-ink-2">{plainSnippet(r.snippet || r.description)}</p>
                  )}
                  {r.coram && (
                    <p className="mt-1.5 pl-6 text-xs text-ec-ink-3">
                      {t("judgeCol")}:{" "}
                      <Link href={`/dashboard/search/judgments?q=${encodeURIComponent(r.coram)}`} className="hover:text-ec-bronze-deep hover:underline">
                        {r.coram}
                      </Link>
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <EmptyPanel icon="search" title={t("noMatchTitle")} body={t("noMatchBody")} />
      )}

      <p className="flex items-start gap-1.5 text-xs text-ec-ink-3">
        <Icon name="alert" className="mt-px h-3.5 w-3.5 shrink-0" />
        {t("sourceListing")}
      </p>
    </div>
  );
}
