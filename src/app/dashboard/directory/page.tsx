import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Icon, type IconName } from "@/components/icons";
import { CodeLabel } from "@/components/code-label";
import { caseDetailHref } from "@/lib/court/case-links";
import { searchAdvocates, searchJudges, searchParties, searchByCaseNumber, getStats, ldEnabled } from "@/lib/court/legaldriver-api";
import { expandCaseType, advocateRole } from "@/lib/court/code-labels";
import { Reveal } from "../motion";

export const dynamic = "force-dynamic";

// WO-82 · Judges & Lawyers — the practice-level directory over the live court corpus.
// Promoted out of the buried Insight→Search tab shell to a first-class Practice surface
// (nav.tsx). Search a name → advocates (bar-wise caseload), judges (dossier + disposal
// patterns), and parties/litigants; or look a case up by registration number. Every
// advocate/judge links to its full dossier, every listed case to its details (WO-83).
// The old /dashboard/search/directory route redirects here (query preserved).
//
// WO-337 · Chambers/Daybreak reskin — faithful to design-mockups/iteration3/console/
// app.directory.tsx (layout/hierarchy/typography/motion via ../motion's Reveal), bound to
// the SAME real search calls above; the reference's dummy advocates/judges/parties become
// real results. Two things the reference shows per-row that the real search payload doesn't
// carry (an advocate's district, a judge's home court + "sitting today") render an honest
// pending state instead of being fabricated or the row dropped — see the inline comments.
// The reference's main search field has no submit button (client-side dummy filter, no
// navigation); this is a real server GET search, so the existing visible "Search" button is
// kept alongside the reference's icon-in-field treatment — a flagged, reasoned deviation.

const EXAMPLES = ["Patel", "Shah", "Mehta", "Desai", "Trivedi"];
const SLICE = { advocates: 25, judges: 25, parties: 30, caseNumber: 25 } as const;

export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: { q?: string; ct?: string; cn?: string; cy?: string };
}) {
  const t = await getTranslations("lookup");
  const td = await getTranslations("dashboard.directory");
  const tc = await getTranslations("codeLabels");
  const tp = await getTranslations("casePreview");
  const tCommon = await getTranslations("common.states");
  const q = (searchParams.q ?? "").trim();
  const cnType = (searchParams.ct ?? "").trim();
  const cnNumber = (searchParams.cn ?? "").trim();
  const cnYear = (searchParams.cy ?? "").trim();
  const cnActive = Boolean(cnNumber && cnYear);
  const enabled = ldEnabled();

  // WO-289: searchAdvocates/searchJudges/searchParties/searchByCaseNumber are now STRICT (they
  // throw on a 503/timeout/network failure instead of degrading to []) — safeSearch() catches that
  // per-section so ONE heavy query can't blank the whole page, while still telling the difference
  // between "genuinely zero results" and "the search is unavailable right now" (never a lying empty).
  // `active=false` short-circuits with no network call at all (mirrors the old ternary gating).
  async function safeSearch<T>(active: boolean, fn: () => Promise<T[]>): Promise<{ data: T[]; error: boolean }> {
    if (!active) return { data: [], error: false };
    try { return { data: await fn(), error: false }; } catch { return { data: [], error: true }; }
  }

  const qActive = enabled && q.length >= 2;
  const [cnSafe, advSafe, judSafe, partySafe, stats] = await Promise.all([
    safeSearch(enabled && cnActive, () => searchByCaseNumber(cnType, cnNumber, cnYear)),
    safeSearch(qActive, () => searchAdvocates(q)),
    safeSearch(qActive, () => searchJudges(q)),
    safeSearch(qActive, () => searchParties(q)),
    enabled ? getStats().catch(() => null) : Promise.resolve(null),
  ]);
  const cnResults = cnSafe.data;
  const advocates = advSafe.data;
  const judges = judSafe.data;
  const parties = partySafe.data;

  const coverage = stats
    ? t("coverage", {
        total: stats.cases_total.toLocaleString("en-IN"),
        district: (stats.by_tier?.DISTRICT ?? 0).toLocaleString("en-IN"),
        high: (stats.by_tier?.HIGH ?? 0).toLocaleString("en-IN"),
      })
    : undefined;

  // The reference's section-label count slot ("3 of 1,204") — fed from the real fetched-array
  // length, never a fabricated corpus-wide total. When the array is longer than the render cap
  // this is an honest "N shown of M returned"; otherwise a plain result count.
  const shownCaption = (n: number, cap: number) =>
    n > cap
      ? td("resultsShown", { shown: cap.toLocaleString("en-IN"), total: n.toLocaleString("en-IN") })
      : td("resultsCount", { count: n });

  return (
    <div className="space-y-6">
      <Reveal as="header" className="border-b border-ec-hair pb-5">
        <h1 className="font-display text-[1.7rem] font-medium leading-tight tracking-tight text-ec-ink">{t("directoryTitle")}</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-ec-ink-3">{t("directorySubtitle")}</p>
      </Reveal>

      <Reveal delay={60}>
        <form method="get" className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ec-ink-3" />
            <input
              name="q"
              defaultValue={q}
              placeholder={t("placeholder")}
              aria-label={t("placeholder")}
              autoFocus
              className="input w-full rounded-lg py-3.5 pl-11 pr-4 text-[15px]"
            />
          </div>
          <button type="submit" className="ec-btn ec-btn-ink shrink-0">{t("search")}</button>
        </form>
        {!enabled ? (
          <p className="mt-3 text-xs text-ec-warn">{t("notConfigured")}</p>
        ) : coverage ? (
          <p className="num mt-3 text-xs text-ec-ink-3">{coverage}</p>
        ) : null}
      </Reveal>

      {/* Honest starting point (charter: never a dead blank), not a bare page. */}
      {enabled && q.length < 2 && !cnActive && (
        <Reveal delay={100} className="ec-card px-6 py-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-ec-m bg-ec-bronze-tint p-2 text-ec-bronze-deep">
              <Icon name="scale" className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-base font-medium text-ec-ink">{t("browseTitle")}</h2>
              <p className="mt-1 text-sm text-ec-ink-3">{t("browseBody")}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-ec-ink-3">{t("examplesLabel")}</span>
                {EXAMPLES.map((name) => (
                  <Link
                    key={name}
                    href={`/dashboard/directory?q=${encodeURIComponent(name)}`}
                    className="press rounded-full border border-ec-hair px-3 py-1 text-xs text-ec-bronze-deep transition-colors hover:bg-ec-bronze-tint"
                  >
                    {name}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      )}

      {enabled && (
        <Reveal delay={120}>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <span className="ec-label mb-2 mr-1">{t("caseNumber.title")}</span>
            <span className="sr-only">{t("caseNumber.subtitle")}</span>
            <label className="flex flex-col gap-1">
              <span className="sr-only">{t("caseNumber.typeLabel")}</span>
              <input
                name="ct"
                defaultValue={cnType}
                placeholder={t("caseNumber.typePlaceholder")}
                className="num w-20 rounded-ec-s border border-ec-hair bg-ec-paper-2 px-2.5 py-1.5 font-mono text-[12.5px] uppercase text-ec-ink outline-none transition-colors focus:border-ec-bronze"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="sr-only">{t("caseNumber.numberLabel")}</span>
              <input
                name="cn"
                defaultValue={cnNumber}
                required
                placeholder={t("caseNumber.numberPlaceholder")}
                className="num w-24 rounded-ec-s border border-ec-hair bg-ec-paper-2 px-2.5 py-1.5 font-mono text-[12.5px] text-ec-ink outline-none transition-colors focus:border-ec-bronze"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="sr-only">{t("caseNumber.yearLabel")}</span>
              <input
                name="cy"
                defaultValue={cnYear}
                required
                inputMode="numeric"
                placeholder={t("caseNumber.yearPlaceholder")}
                className="num w-20 rounded-ec-s border border-ec-hair bg-ec-paper-2 px-2.5 py-1.5 font-mono text-[12.5px] text-ec-ink outline-none transition-colors focus:border-ec-bronze"
              />
            </label>
            <button
              type="submit"
              className="rounded-ec-s border border-ec-hair-strong px-3 py-1.5 text-[12.5px] text-ec-ink-2 transition-colors hover:border-ec-bronze hover:text-ec-bronze-deep"
            >
              {t("caseNumber.search")}
            </button>
          </form>

          {cnActive && (
            <div className="mt-4 border-t border-ec-hair pt-4">
              {cnResults.length ? (
                <ul className="divide-y divide-ec-hair">
                  {cnResults.slice(0, SLICE.caseNumber).map((p, i) => (
                    <li key={`${p.cnr}-${i}`} className="ec-row flex items-center justify-between gap-3 px-1 py-2.5 text-sm">
                      <Link href={caseDetailHref(p.cnr)} className="group min-w-0 flex-1 truncate">
                        <span className="font-medium text-ec-ink group-hover:text-ec-bronze-deep group-hover:underline">{p.name || p.cnr}</span>
                        <span className="num ml-2 font-mono text-[0.7rem] text-ec-ink-3">{p.cnr}</span>
                      </Link>
                      <span className="flex shrink-0 items-center gap-2">
                        {p.side && (
                          <span className={`ec-chip ${/pet|appl|compl/i.test(p.side) ? "ec-chip-success" : ""}`}>{p.side.toLowerCase()}</span>
                        )}
                        <CodeLabel value={expandCaseType(p.case_type, p.tier)} showCode={false} className="hidden text-xs text-ec-ink-3 sm:inline" fallback="" />
                        <Link href={caseDetailHref(p.cnr)} className="whitespace-nowrap text-xs font-medium text-ec-bronze-deep hover:underline">{tp("viewDetails")}</Link>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : cnSafe.error ? (
                <SectionNotice icon="alert" tone="error" title={t("searchErrorTitle")} body={t("searchErrorBody")} />
              ) : (
                <SectionNotice icon="search" title={t("caseNumber.noResults")} body={t("caseNumber.noResultsBody")} />
              )}
            </div>
          )}
        </Reveal>
      )}

      {q.length >= 2 && (
        <Reveal delay={180} className="space-y-9">
          <section>
            <div className="mb-1.5 flex items-end justify-between gap-3">
              <div className="ec-label">{t("advocates")}</div>
              <span className="ec-label">{shownCaption(advocates.length, SLICE.advocates)}</span>
            </div>
            <div className="mb-1 h-[3px] border-y border-ec-hair" />
            {advocates.length ? (
              <ul className="divide-y divide-ec-hair">
                {advocates.slice(0, SLICE.advocates).map((a, i) => {
                  // Role-as-entity flag (WO-32): APP/PP/AGP etc. are court roles, not individual
                  // advocates — label + don't link them as if they were a person.
                  const role = advocateRole(a.name_raw);
                  return (
                    <li key={(a.bar_id ?? "") + i} className="ec-row grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 px-1 py-3">
                      <div className="min-w-0">
                        {role.isRole ? (
                          <span className="font-display block truncate text-[16px] text-ec-ink" title={tc("roleAria")}>{role.full ?? a.name_raw}</span>
                        ) : a.bar_id ? (
                          <Link href={`/dashboard/advocate/${a.bar_id}`} className="font-display block truncate text-[16px] text-ec-ink hover:text-ec-bronze-deep">
                            {a.name_raw}
                          </Link>
                        ) : (
                          <span className="font-display block truncate text-[16px] text-ec-ink">{a.name_raw}</span>
                        )}
                        <div className="num mt-0.5 flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ec-ink-3">
                          <span className="truncate">{a.bar_id ? td("barLabel", { id: a.bar_id }) : td("noBarLabel")}</span>
                          {role.isRole && <span className="ec-chip ec-chip-hot shrink-0 !text-[9px]">{tc("role")}</span>}
                        </div>
                      </div>
                      <span className="num shrink-0 font-mono text-[12px] text-ec-ink-2">{t("casesCount", { n: a.cases })}</span>
                    </li>
                  );
                })}
              </ul>
            ) : advSafe.error ? (
              <SectionNotice icon="alert" tone="error" title={t("searchErrorTitle")} body={t("searchErrorBody")} />
            ) : (
              <p className="py-3 text-sm text-ec-ink-3">{t("noAdvocates")}</p>
            )}
          </section>

          <section>
            <div className="mb-1.5 flex items-end justify-between gap-3">
              <div className="ec-label">{t("judges")}</div>
              <span className="ec-label">{shownCaption(judges.length, SLICE.judges)}</span>
            </div>
            <div className="mb-1 h-[3px] border-y border-ec-hair" />
            {judges.length ? (
              <ul className="divide-y divide-ec-hair">
                {judges.slice(0, SLICE.judges).map((j) => (
                  <li key={j.judge_id} className="ec-row grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 px-1 py-3">
                    <div className="min-w-0">
                      <Link href={`/dashboard/judge/${j.judge_id}`} className="font-display block truncate text-[16px] text-ec-ink hover:text-ec-bronze-deep">
                        {j.name_raw}
                      </Link>
                      {/* The reference shows this judge's home court + a "sitting today" pill; the
                          search-result payload carries neither (only the full /judge/{id} dossier
                          does) — honest-pending here rather than fabricated or dropped. No "sitting
                          today" pill is rendered for the same reason: it's a true/false claim we
                          can't verify, so it's never shown (the reference itself renders it only
                          conditionally — this is that same false-branch, exercised honestly). */}
                      <div className="num mt-0.5 truncate font-mono text-[10.5px] uppercase tracking-[0.08em] text-ec-ink-3">
                        {tCommon("notOnRecord")}
                      </div>
                    </div>
                    <span className="num shrink-0 font-mono text-[12px] text-ec-ink-2">{t("casesCount", { n: j.cases })}</span>
                  </li>
                ))}
              </ul>
            ) : judSafe.error ? (
              <SectionNotice icon="alert" tone="error" title={t("searchErrorTitle")} body={t("searchErrorBody")} />
            ) : (
              <p className="py-3 text-sm text-ec-ink-3">{t("noJudges")}</p>
            )}
          </section>

          <section>
            <div className="mb-1.5 flex items-end justify-between gap-3">
              <div className="ec-label">{t("parties")}</div>
              <span className="ec-label">{shownCaption(parties.length, SLICE.parties)}</span>
            </div>
            <div className="mb-1 h-[3px] border-y border-ec-hair" />
            {parties.length ? (
              <ul className="divide-y divide-ec-hair">
                {parties.slice(0, SLICE.parties).map((p, i) => (
                  <li key={p.cnr + i} className="ec-row flex items-baseline justify-between gap-3 px-1 py-3">
                    <Link href={caseDetailHref(p.cnr)} className="group min-w-0 flex-1 truncate">
                      <span className="font-display truncate text-[15px] text-ec-ink group-hover:text-ec-bronze-deep">{p.name}</span>
                      <span className="num ml-2 font-mono text-[0.68rem] text-ec-ink-3">{p.cnr}</span>
                    </Link>
                    <span className="flex shrink-0 items-center gap-2">
                      {p.side && (
                        <span className={`ec-chip ${/pet|appl|compl/i.test(p.side) ? "ec-chip-success" : ""}`}>{p.side.toLowerCase()}</span>
                      )}
                      <CodeLabel value={expandCaseType(p.case_type, p.tier)} showCode={false} className="hidden text-xs text-ec-ink-3 sm:inline" fallback="" />
                      <Link href={caseDetailHref(p.cnr)} className="whitespace-nowrap text-xs font-medium text-ec-bronze-deep hover:underline">{tp("viewDetails")}</Link>
                    </span>
                  </li>
                ))}
              </ul>
            ) : partySafe.error ? (
              <SectionNotice icon="alert" tone="error" title={t("searchErrorTitle")} body={t("searchErrorBody")} />
            ) : (
              <div className="py-3">
                <p className="text-sm text-ec-ink">{t("noParties")}</p>
                <p className="mt-0.5 text-xs text-ec-ink-3">{t("noPartiesBody")}</p>
              </div>
            )}
          </section>
        </Reveal>
      )}

      {enabled && q.length === 1 && <p className="text-xs text-ec-ink-3">{t("typeMore")}</p>}
      {q.length >= 2 && <p className="border-t border-ec-hair pt-4 text-xs text-ec-ink-3">{t("footer")}</p>}
    </div>
  );
}

// A genuine "something's wrong" (tone="error") vs a plain "nothing found" gets the same compact
// card treatment used elsewhere in the reskin (Documents/Cases empties) — reserved for states
// worth the advocate's eye; routine zero-result sections stay a plain inline line (see above).
function SectionNotice({ icon, title, body, tone = "empty" }: { icon: IconName; title: string; body?: string; tone?: "empty" | "error" }) {
  const wrap = tone === "error" ? "bg-ec-danger-t text-ec-danger" : "bg-ec-paper-3 text-ec-ink-3";
  return (
    <div className="ec-card flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span className={`rounded-full p-2.5 ${wrap}`}>
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <p className="font-display text-base text-ec-ink">{title}</p>
      {body && <p className="max-w-sm text-sm text-ec-ink-3">{body}</p>}
    </div>
  );
}
