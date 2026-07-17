import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import { CourtField, CourtDate, EmptyCell } from "@/components/court";
import { Icon } from "@/components/icons";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";
import { getJudge, ldEnabled } from "@/lib/court/legaldriver-api";
import { caseDetailHref } from "@/lib/court/case-links";
import { Pagination } from "@/components/pagination";
import { parsePage, clampPerPage, rangeFor } from "@/lib/paginate";
import { expandCaseType, expandDisposal } from "@/lib/court/code-labels";

export const dynamic = "force-dynamic";

// Browsable judge dossier ("know your judge") from /judge/{id}: caseload, disposal
// mix, decisions-by-year, tier breakdown, and advocate/case-type cross-link panel.
export default async function JudgePage({
  params,
  searchParams,
}: {
  params: { judgeId: string };
  searchParams: { page?: string; per?: string };
}) {
  const t = await getTranslations("judge");
  const tCommon = await getTranslations("common");
  const tp = await getTranslations("casePreview");
  if (!ldEnabled()) notFound();
  const j = await getJudge(params.judgeId);
  if (!j) notFound();

  // ── Core aggregations ───────────────────────────────────────────────────────
  const disposed = j.cases.filter((c) => (c.status ?? "").toUpperCase() === "DISPOSED");
  const pending = j.cases.length - disposed.length;

  // Disposal-nature breakdown (bar chart data)
  const byNature = new Map<string, number>();
  for (const c of j.cases) {
    // WO-32: group by the expanded disposal description, not the raw "Contested--56-…" code.
    const n = expandDisposal(c.disposal_nature).full || null;
    if (n) byNature.set(n, (byNature.get(n) ?? 0) + 1);
  }
  const disposalNatures = [...byNature.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const maxNatureCount = disposalNatures[0]?.[1] ?? 1;

  // Decisions-by-year mini-histogram
  const byYear = new Map<number, number>();
  for (const c of j.cases) {
    if (c.decision_date) {
      const yr = new Date(c.decision_date).getFullYear();
      if (yr >= 2000 && yr <= new Date().getFullYear()) {
        byYear.set(yr, (byYear.get(yr) ?? 0) + 1);
      }
    }
  }
  const years = [...byYear.entries()].sort((a, b) => a[0] - b[0]);
  const maxYearCount = Math.max(...years.map(([, n]) => n), 1);

  // Case-type mix (top 8)
  const byType = new Map<string, number>();
  for (const c of j.cases) {
    // WO-32: group by the expanded case-type name (merges "CR.A" / "CR.A(CRIMINAL APPEAL)-43" etc.).
    const ct = expandCaseType(c.case_type, c.tier).full || "—";
    byType.set(ct, (byType.get(ct) ?? 0) + 1);
  }
  const topTypes = [...byType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  // Tier breakdown
  const byTier = new Map<string, number>();
  for (const c of j.cases) {
    const tier = (c.tier ?? "").trim() || "UNKNOWN";
    byTier.set(tier, (byTier.get(tier) ?? 0) + 1);
  }

  // Most frequent advocates before this judge (cross-link panel)
  const byAdvocate = new Map<string, number>();
  for (const c of j.cases) {
    for (const adv of c.advocate_names ?? []) {
      const name = adv.trim();
      if (name) byAdvocate.set(name, (byAdvocate.get(name) ?? 0) + 1);
    }
  }
  const topAdvocates = [...byAdvocate.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Decisions, newest first (all disposed cases that carry a decision date). WO-56:
  // paginate the full set instead of the old `.slice(0, 15)` that hid the real size —
  // the analytics above stay over the whole returned array.
  const decisions = [...disposed]
    .filter((c) => c.decision_date)
    .sort((a, b) => String(b.decision_date).localeCompare(String(a.decision_date)));
  const page = parsePage(searchParams.page);
  const per = clampPerPage(searchParams.per);
  const { from, to } = rangeFor(page, per);
  const pageDecisions = decisions.slice(from, to + 1);

  // ── Supabase: which of the ON-SCREEN CNRs are tracked by this firm? ────────
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  const cnrs = pageDecisions.map((c) => c.cnr);
  const { data: tracked } = tenantId && cnrs.length
    ? await supabase.from("matter").select("id, cnr").eq("tenant_id", tenantId).in("cnr", cnrs)
    : { data: [] };
  const byCnr = new Map((tracked ?? []).map((m) => [m.cnr, m.id]));

  // ── Resolve advocate names → bar IDs for cross-links ───────────────────────
  // We look at the case-level advocate names stored on decisions in our DB.
  // Cross-link via the first-class directory route (no extra API call needed).
  const advocateSearchHref = (name: string) =>
    `/dashboard/directory?q=${encodeURIComponent(name)}`;

  // ── Tier chip colours ───────────────────────────────────────────────────────
  const tierTone = (tier: string): "brand" | "neutral" | "amber" =>
    tier === "HIGH" ? "brand" : tier === "DISTRICT" ? "neutral" : "amber";

  const disposalRate = j.cases.length
    ? Math.round((disposed.length / j.cases.length) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* ── Back link ──────────────────────────────────────────────────────── */}
      <Link
        href="/dashboard/directory"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ec-bronze-deep hover:text-ec-bronze"
      >
        <Icon name="back" className="h-4 w-4" />
        {t("backToLookup")}
      </Link>

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <PageHeader
        title={j.name}
        subtitle={t("subtitle", {
          count: j.case_count.toLocaleString("en-IN"),
          returned: j.returned,
        })}
      />

      {/* ── Stat tiles ─────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <div className="px-4 py-3">
            <p className="label">{t("statTotalCases")}</p>
            <p className="text-2xl font-semibold">{j.case_count.toLocaleString("en-IN")}</p>
          </div>
        </Card>
        <Card>
          <div className="px-4 py-3">
            <p className="label">{t("statDisposed")}</p>
            <p className="text-2xl font-semibold">{disposed.length}</p>
          </div>
        </Card>
        <Card>
          <div className="px-4 py-3">
            <p className="label">{t("statPending")}</p>
            <p className="text-2xl font-semibold">{pending}</p>
          </div>
        </Card>
        <Card>
          <div className="px-4 py-3">
            <p className="label">{t("statDisposalRate")}</p>
            <p className="text-2xl font-semibold">{disposalRate}%</p>
          </div>
        </Card>
      </section>

      {/* ── Two-column layout: analytics left, cross-links right ───────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">

          {/* ── Disposal-nature breakdown bar chart ──────────────────────────── */}
          {disposalNatures.length > 0 && (
            <Card>
              <div className="border-b border-line px-5 py-4">
                <p className="font-medium">{t("disposalNatureTitle")}</p>
              </div>
              <ul className="space-y-2 px-5 py-4">
                {disposalNatures.map(([nature, count]) => {
                  const pct = Math.round((count / maxNatureCount) * 100);
                  return (
                    <li key={nature}>
                      <div className="mb-0.5 flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-xs font-medium text-ink-soft">
                          {nature}
                        </span>
                        <span className="num shrink-0 text-xs text-ink-faint">{count}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-ec-paper-3">
                        <div
                          className="h-2 rounded-full bg-ec-bronze transition-all"
                          style={{ width: `${pct}%` }}
                          aria-label={`${pct}%`}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {/* ── Decisions-by-year histogram ──────────────────────────────────── */}
          {years.length > 0 && (
            <Card>
              <div className="border-b border-line px-5 py-4">
                <p className="font-medium">{t("decisionsByYearTitle")}</p>
              </div>
              <div className="px-5 py-4">
                <div className="flex items-end gap-1" style={{ height: "80px" }}>
                  {years.map(([year, count]) => {
                    const heightPct = Math.max(8, Math.round((count / maxYearCount) * 100));
                    return (
                      <div
                        key={year}
                        className="group relative flex flex-1 flex-col items-center justify-end"
                        title={`${year}: ${count} decisions`}
                      >
                        <div
                          className="w-full rounded-sm bg-ec-bronze/55 transition-all group-hover:bg-ec-bronze"
                          style={{ height: `${heightPct}%` }}
                        />
                        <span className="mt-1 hidden text-[10px] text-ink-faint sm:block">
                          {String(year).slice(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex justify-between text-[10px] text-ink-faint sm:hidden">
                  <span>{years[0]?.[0]}</span>
                  <span>{years[years.length - 1]?.[0]}</span>
                </div>
              </div>
            </Card>
          )}

          {/* ── Recent decisions (with tier + disposal_nature columns) ────────── */}
          <Card>
            <div className="border-b border-line px-5 py-4">
              <p className="font-medium">{t("recentDecisions")}</p>
            </div>
            {decisions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-ink-faint">
                      <th className="px-5 py-2 font-medium">{t("colCnr")}</th>
                      <th className="px-3 py-2 font-medium">{t("colType")}</th>
                      <th className="px-3 py-2 font-medium">{t("colTier")}</th>
                      <th className="px-3 py-2 font-medium">{t("colNature")}</th>
                      <th className="px-3 py-2 font-medium">{t("colDecided")}</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {pageDecisions.map((c) => {
                      const mid = byCnr.get(c.cnr);
                      return (
                        <tr key={c.cnr} className="border-t border-line hover:bg-paper">
                          <td className="px-5 py-2 font-mono text-xs">
                            <Link
                              href={caseDetailHref(c.cnr, mid)}
                              className="text-brand-600 hover:underline"
                            >
                              {c.cnr}
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-ink-muted" title={c.case_type ?? undefined}>
                            <CourtField value={expandCaseType(c.case_type, c.tier).full || null} field="case_type" emptyLabel={tCommon("states.notOnRecord")} />
                          </td>
                          <td className="px-3 py-2">
                            {c.tier ? (
                              <Badge tone={tierTone(c.tier)}>{c.tier}</Badge>
                            ) : (
                              <EmptyCell label={tCommon("states.notOnRecord")} />
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-ink-muted" title={c.disposal_nature ?? undefined}>
                            <CourtField value={c.disposal_nature ? expandDisposal(c.disposal_nature).full : null} field="disposal" emptyLabel={tCommon("states.notOnRecord")} />
                          </td>
                          <td className="px-3 py-2 text-xs text-ink-faint">
                            <CourtDate value={c.decision_date} emptyLabel={tCommon("states.notOnRecord")} />
                          </td>
                          <td className="px-3 py-2 text-right">
                            {mid ? (
                              <span className="text-xs text-ink-faint">{tp("tracked")}</span>
                            ) : (
                              <Link href={caseDetailHref(c.cnr)} className="whitespace-nowrap text-xs font-medium text-brand-600 hover:underline">
                                {tp("viewDetails")}
                              </Link>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon="scale" title={t("emptyDecisions")} />
            )}
            {decisions.length > 0 && (
              <div className="border-t border-line px-5 py-3">
                <Pagination page={page} perPage={per} total={decisions.length} />
              </div>
            )}
            <p className="px-5 py-3 text-xs text-ink-faint">
              {t("provenance", {
                returned: j.returned,
                count: j.case_count.toLocaleString("en-IN"),
              })}
            </p>
          </Card>
        </div>

        {/* ── Right column: cross-link panels ──────────────────────────────── */}
        <div className="space-y-6">

          {/* Case-type mix chips */}
          <Card>
            <div className="border-b border-line px-5 py-4">
              <p className="font-medium">{t("caseTypeMix")}</p>
            </div>
            <ul className="flex flex-wrap gap-2 px-5 py-4">
              {topTypes.map(([ct, n]) => (
                <li key={ct}>
                  <Badge tone="neutral">
                    {ct} · {n}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>

          {/* Tier split */}
          {byTier.size > 0 && (
            <Card>
              <div className="border-b border-line px-5 py-4">
                <p className="font-medium">{t("tierSplitTitle")}</p>
              </div>
              <ul className="divide-y divide-line text-sm">
                {[...byTier.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([tier, n]) => (
                    <li key={tier} className="flex items-center justify-between px-5 py-2.5">
                      <Badge tone={tierTone(tier)}>{tier}</Badge>
                      <span className="num text-xs text-ink-faint">{n}</span>
                    </li>
                  ))}
              </ul>
            </Card>
          )}

          {/* Most frequent advocates cross-link panel */}
          {topAdvocates.length > 0 && (
            <Card>
              <div className="border-b border-line px-5 py-4">
                <p className="font-medium">{t("topAdvocatesTitle")}</p>
                <p className="mt-0.5 text-xs text-ink-faint">{t("topAdvocatesHelp")}</p>
              </div>
              <ul className="divide-y divide-line text-sm">
                {topAdvocates.map(([name, count], i) => (
                  <li key={name} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="num w-5 shrink-0 text-xs text-ink-faint">{i + 1}</span>
                      <Link
                        href={advocateSearchHref(name)}
                        className="min-w-0 truncate font-medium text-brand-600 hover:underline"
                        title={name}
                      >
                        {name}
                      </Link>
                    </span>
                    <span className="num shrink-0 text-xs text-ink-faint">{count}</span>
                  </li>
                ))}
              </ul>
              <p className="px-5 py-3 text-xs text-ink-faint">{t("topAdvocatesNote")}</p>
            </Card>
          )}

          {/* Data-gap notice if no disposal_nature data */}
          {disposalNatures.length === 0 && (
            <div className="rounded-xl border border-dashed border-ec-warn/30 bg-ec-warn-t px-4 py-3 text-xs text-ec-warn">
              <span className="font-semibold">{t("dataGapLabel")}</span>{" "}
              {t("dataGapDisposalNature")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
