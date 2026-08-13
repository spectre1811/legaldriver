import type { ReactNode } from "react";
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
//
// WO-337 WAVE-2 · exact-fidelity reconcile vs design-mockups/iteration3/console/app.directory.tsx
// (+ ui.tsx's AppMasthead/SectionLabel) — node-for-node: ink masthead, the max-w-5xl reading
// column, the icon-in-field search well, the case-number lookup row, and all three result
// sections rebuilt to the reference's own layout/typography/copy, on the SAME real search calls
// above. Flagged, reasoned deviations only (ui-pipeline.md — none are decorative additions):
//   1. The reference's search field has no submit (a client-side dummy filter, `q` pre-seeded to
//      "Patel"); this is a real server GET search, so the visible "Search" button stays alongside
//      the icon-in-field look.
//   2. A pre-query "browse" card and the honest 1-char/error states have no reference counterpart
//      (the mockup's `q` is always pre-filled, so it never needed one) — never a dead blank.
//   3. Two fields the reference shows per advocate/judge row (district, home court) aren't in the
//      real search payload (AdvocateSearchResult/JudgeSearchResult carry no such field) — rendered
//      as the shared "not on the court record" placeholder, never dropped or invented. The judge
//      row's "sitting today" pill and case count are the reference's own conditional/absent slot —
//      honestly never rendered (real data covers neither), not a dropped node.
//   4. The reference's Parties row is a non-interactive aggregate ("appears in N", no drill-down
//      target — there's no per-party profile in this product). Our real payload is one real
//      case-match per row (PartyCaseResult), so the row keeps its Link to that case, with the real
//      CNR standing in the count's slot rather than a fabricated "appears in 1".
//   5. Case-number lookup results have no reference UI at all (the mockup's "Look up" is inert) —
//      the results list is a necessary, undecorated addition (case row + view-details, the same
//      pattern every case list in the app already uses).
//   6. The provenance footer (source + known matching caveats) is a hard repo rule (CLAUDE.md §3) —
//      the reference has none; ours is required regardless. WO-413 B1: the "not legal advice" clause
//      dropped from it (founder decision — console surfaces no longer carry that disclaimer; it
//      stays only on the exported PDF and the public share page).
//
// WO-349 WAVE-3 · masthead unrounded to bleed edge-to-edge like notifications/onboarding (was an
// inset `rounded-xl` card within the shell's padding). Subtitle: the prototype's exact string is
// "… — 55,000,000+ case records, All India." but that figure isn't in plan/context/00-INPUTS.md and
// the live corpus is Gujarat-scoped, so the "All India / 55M" claim would be a fabricated figure on
// a user surface — dropped per the honesty bar (master call, overrides literal prototype-match). The
// real, dynamic `coverage` line right below the search field remains as the honest scope disclosure.

const EXAMPLES = ["Patel", "Shah", "Mehta", "Desai", "Trivedi"];
const SLICE = { advocates: 25, judges: 25, parties: 30, caseNumber: 25 } as const;

export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: { q?: string; ct?: string; cn?: string; cy?: string };
}) {
  const t = await getTranslations("dashboard.directory");
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
    n > cap ? t("resultsShown", { shown: cap.toLocaleString("en-IN"), total: n.toLocaleString("en-IN") }) : t("resultsCount", { count: n });

  return (
    <div className="space-y-8">
      <Reveal as="div" className="mk-engraved -mx-5 rounded-[14px] bg-ec-ink px-5 py-7 text-ec-paper sm:-mx-8 sm:px-7">
        <h1 className="font-display text-[28px] leading-tight text-ec-paper sm:text-[32px]">{t("title")}</h1>
        <p className="mt-1.5 text-[13px] text-ec-line-strong">{t("subtitle")}</p>
      </Reveal>

      <div className="mx-auto max-w-5xl space-y-6">
        <Reveal delay={60}>
          <form method="get" className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ec-muted-ink" />
              <input
                name="q"
                defaultValue={q}
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchAria")}
                autoFocus
                className="input w-full rounded-lg py-3.5 pl-11 pr-4 text-[15px]"
              />
            </div>
            <button type="submit" className="ec-btn ec-btn-ink shrink-0">{t("searchButton")}</button>
          </form>
          {!enabled ? (
            <p className="mt-3 text-xs text-ec-warn">{t("notConfigured")}</p>
          ) : coverage ? (
            <p className="num mt-3 text-xs text-ec-muted-ink">{coverage}</p>
          ) : null}
        </Reveal>

        {/* Honest starting point (charter: never a dead blank) — the reference's `q` is always
            pre-seeded so it never needed this state; see deviation #2 above. */}
        {enabled && q.length < 2 && !cnActive && (
          <Reveal delay={100} className="ec-card px-6 py-6">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 rounded-ec-m bg-ec-bronze-tint p-2 text-ec-bronze-deep">
                <Icon name="scale" className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-base font-medium text-ec-ink">{t("browseTitle")}</h2>
                <p className="mt-1 text-sm text-ec-muted-ink">{t("browseBody")}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-ec-muted-ink">{t("examplesLabel")}</span>
                  {EXAMPLES.map((name) => (
                    <Link
                      key={name}
                      href={`/dashboard/directory?q=${encodeURIComponent(name)}`}
                      className="press rounded-full border border-ec-line px-3 py-1 text-xs text-ec-bronze-deep transition-colors hover:bg-ec-bronze-tint"
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
              <span className="ec-label mb-2 mr-1">{t("caseNumberTitle")}</span>
              <label className="flex flex-col gap-1">
                <span className="sr-only">{t("caseNumberTypeAria")}</span>
                <input
                  name="ct"
                  defaultValue={cnType}
                  placeholder={t("caseNumberTypePlaceholder")}
                  className="num w-20 rounded-md border border-ec-line bg-ec-card px-2.5 py-1.5 font-mono text-[12.5px] uppercase text-ec-ink outline-none transition-colors focus:border-ec-bronze"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="sr-only">{t("caseNumberNumberAria")}</span>
                <input
                  name="cn"
                  defaultValue={cnNumber}
                  required
                  placeholder={t("caseNumberNumberPlaceholder")}
                  className="num w-24 rounded-md border border-ec-line bg-ec-card px-2.5 py-1.5 font-mono text-[12.5px] text-ec-ink outline-none transition-colors focus:border-ec-bronze"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="sr-only">{t("caseNumberYearAria")}</span>
                <input
                  name="cy"
                  defaultValue={cnYear}
                  required
                  inputMode="numeric"
                  placeholder={t("caseNumberYearPlaceholder")}
                  className="num w-20 rounded-md border border-ec-line bg-ec-card px-2.5 py-1.5 font-mono text-[12.5px] text-ec-ink outline-none transition-colors focus:border-ec-bronze"
                />
              </label>
              <button
                type="submit"
                className="rounded-md border border-ec-line-strong px-3 py-1.5 text-[12.5px] text-ec-ink-2 transition-colors hover:border-ec-bronze hover:text-ec-bronze-deep"
              >
                {t("caseNumberSearch")}
              </button>
            </form>

            {cnActive && (
              <div className="mt-4 border-t border-ec-line pt-4">
                {cnResults.length ? (
                  <ul className="divide-y divide-ec-line">
                    {cnResults.slice(0, SLICE.caseNumber).map((p, i) => (
                      <li key={`${p.cnr}-${i}`} className="ec-row flex items-center justify-between gap-3 px-1 py-2.5 text-sm">
                        <Link href={caseDetailHref(p.cnr)} className="group min-w-0 flex-1 truncate">
                          <span className="font-medium text-ec-ink group-hover:text-ec-bronze-deep group-hover:underline">{p.name || p.cnr}</span>
                          <span className="num ml-2 font-mono text-[0.7rem] text-ec-muted-ink">{p.cnr}</span>
                        </Link>
                        <span className="flex shrink-0 items-center gap-2">
                          {p.side && (
                            <span className={`ec-chip ${/pet|appl|compl/i.test(p.side) ? "ec-chip-success" : ""}`}>{p.side.toLowerCase()}</span>
                          )}
                          <CodeLabel value={expandCaseType(p.case_type, p.tier)} showCode={false} className="hidden text-xs text-ec-muted-ink sm:inline" fallback="" />
                          <Link href={caseDetailHref(p.cnr)} className="whitespace-nowrap text-xs font-medium text-ec-bronze-deep hover:underline">{tp("viewDetails")}</Link>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : cnSafe.error ? (
                  <SectionNotice icon="alert" tone="error" title={t("searchErrorTitle")} body={t("searchErrorBody")} />
                ) : (
                  <SectionNotice icon="search" title={t("caseNumberNoResults")} body={t("caseNumberNoResultsBody")} />
                )}
              </div>
            )}
          </Reveal>
        )}

        {q.length >= 2 && (
          <Reveal delay={180} className="space-y-9">
            <section>
              <SectionLabel right={<span className="ec-label">{shownCaption(advocates.length, SLICE.advocates)}</span>}>
                {t("advocates")}
              </SectionLabel>
              {advocates.length ? (
                <ul className="divide-y divide-ec-line">
                  {advocates.slice(0, SLICE.advocates).map((a, i) => {
                    // Role-as-entity flag (WO-32): APP/PP/AGP etc. are court roles, not individual
                    // advocates — label + don't link them as if they were a person.
                    const role = advocateRole(a.name_raw);
                    const linkable = Boolean(a.bar_id) && !role.isRole;
                    const nameEl = (
                      <span
                        className={`font-display block truncate text-[16px] text-ec-ink ${linkable ? "hover:text-ec-bronze" : ""}`}
                        title={role.isRole ? tc("roleAria") : undefined}
                      >
                        {role.isRole ? (role.full ?? a.name_raw) : a.name_raw}
                      </span>
                    );
                    const metaEl = (
                      <div className="num mt-0.5 flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ec-muted-ink">
                        <span className="truncate">
                          {a.bar_id ? t("barLabel", { id: a.bar_id }) : t("noBarLabel")}
                          {!role.isRole && <> · {tCommon("notOnRecord")}</>}
                        </span>
                        {role.isRole && <span className="ec-chip ec-chip-hot shrink-0 !text-[9px]">{tc("role")}</span>}
                      </div>
                    );
                    const countEl = <span className="num shrink-0 font-mono text-[12px] text-ec-ink-2">{t("advocateMatters", { n: a.cases })}</span>;
                    return (
                      <li key={(a.bar_id ?? "") + i} className="ec-row py-3">
                        {linkable ? (
                          <Link href={`/dashboard/advocate/${a.bar_id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
                            <div className="min-w-0">{nameEl}{metaEl}</div>
                            {countEl}
                          </Link>
                        ) : (
                          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
                            <div className="min-w-0">{nameEl}{metaEl}</div>
                            {countEl}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : advSafe.error ? (
                <SectionNotice icon="alert" tone="error" title={t("searchErrorTitle")} body={t("searchErrorBody")} />
              ) : (
                <p className="py-3 text-sm text-ec-muted-ink">{t("noAdvocates")}</p>
              )}
            </section>

            <section>
              <SectionLabel right={<span className="ec-label">{shownCaption(judges.length, SLICE.judges)}</span>}>
                {t("judges")}
              </SectionLabel>
              {judges.length ? (
                <ul className="divide-y divide-ec-line">
                  {judges.slice(0, SLICE.judges).map((j) => (
                    <li key={j.judge_id} className="ec-row py-3">
                      <Link href={`/dashboard/judge/${j.judge_id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
                        <div className="min-w-0">
                          <span className="font-display block truncate text-[16px] text-ec-ink hover:text-ec-bronze">{j.name_raw}</span>
                          {/* The reference shows this judge's home court + a conditional "sitting
                              today" pill; the search-result payload carries neither (only the full
                              /judge/{id} dossier does) — honest-pending here, never fabricated. The
                              pill is never rendered for the same reason (real data doesn't cover
                              it) — the reference's own conditional false-branch, honestly kept. */}
                          <div className="mt-0.5 truncate text-[12.5px] text-ec-ink-2">{tCommon("notOnRecord")}</div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : judSafe.error ? (
                <SectionNotice icon="alert" tone="error" title={t("searchErrorTitle")} body={t("searchErrorBody")} />
              ) : (
                <p className="py-3 text-sm text-ec-muted-ink">{t("noJudges")}</p>
              )}
            </section>

            <section>
              <SectionLabel right={<span className="ec-label">{shownCaption(parties.length, SLICE.parties)}</span>}>
                {t("parties")}
              </SectionLabel>
              {parties.length ? (
                <ul className="divide-y divide-ec-line">
                  {parties.slice(0, SLICE.parties).map((p, i) => (
                    <li key={p.cnr + i} className="flex items-baseline justify-between gap-3 py-3">
                      {/* The reference's party row is a non-interactive aggregate ("appears in N",
                          no drill-down target — there's no per-party profile here). Our real
                          payload is one real case match per row, so it keeps a Link to that case,
                          with the real CNR standing in for the fabricated count (deviation #4). */}
                      <Link href={caseDetailHref(p.cnr)} className="group min-w-0 flex-1 truncate">
                        <span className="truncate text-[14px] text-ec-ink group-hover:text-ec-bronze">{p.name}</span>
                      </Link>
                      <span className="num shrink-0 font-mono text-[12px] text-ec-muted-ink">{p.cnr}</span>
                    </li>
                  ))}
                </ul>
              ) : partySafe.error ? (
                <SectionNotice icon="alert" tone="error" title={t("searchErrorTitle")} body={t("searchErrorBody")} />
              ) : (
                <div className="py-3">
                  <p className="text-sm text-ec-ink">{t("noParties")}</p>
                  <p className="mt-0.5 text-xs text-ec-muted-ink">{t("noPartiesBody")}</p>
                </div>
              )}
            </section>
          </Reveal>
        )}

        {enabled && q.length === 1 && <p className="text-xs text-ec-muted-ink">{t("typeMore")}</p>}
        {q.length >= 2 && <p className="border-t border-ec-line pt-4 text-xs text-ec-muted-ink">{t("footer")}</p>}
      </div>
    </div>
  );
}

// Small-caps section label + the double-hairline rule beneath it (ui.tsx's SectionLabel) — kept
// local (not shared) like notifications/parts.tsx's copy; promote if a third page needs it.
function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3">
      <div className="flex items-end justify-between gap-3">
        <div className="ec-label">{children}</div>
        {right}
      </div>
      <div className="mt-1.5 h-[3px] border-y border-ec-line" />
    </div>
  );
}

// A genuine "something's wrong" (tone="error") vs a plain "nothing found" gets the same compact
// card treatment used elsewhere in the reskin (Documents/Cases empties) — reserved for states
// worth the advocate's eye; routine zero-result sections stay a plain inline line (see above).
function SectionNotice({ icon, title, body, tone = "empty" }: { icon: IconName; title: string; body?: string; tone?: "empty" | "error" }) {
  const wrap = tone === "error" ? "bg-ec-danger-t text-ec-danger" : "bg-ec-paper-3 text-ec-muted-ink";
  return (
    <div className="ec-card flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span className={`rounded-full p-2.5 ${wrap}`}>
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <p className="font-display text-base text-ec-ink">{title}</p>
      {body && <p className="max-w-sm text-sm text-ec-muted-ink">{body}</p>}
    </div>
  );
}
