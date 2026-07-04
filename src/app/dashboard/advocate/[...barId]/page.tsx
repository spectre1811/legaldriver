import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader, Card, Badge, EmptyState, fmtDate } from "@/components/ui";
import { Icon } from "@/components/icons";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";
import { getAdvocateProfile, ldEnabled } from "@/lib/court/legaldriver-api";
import { TrackCaseButton } from "@/components/track-case-button";

export const dynamic = "force-dynamic";

const TIER_TONE: Record<string, "brand" | "neutral"> = {
  HIGH: "brand",
  DISTRICT: "neutral",
};

// Browsable advocate practice profile from the live LegalDriver API (/advocate/{bar_id}).
// Catch-all route: bar_id is numeric (HC) OR slash-form "G/NN/YYYY" (district), which
// arrives as multiple path segments — rejoin them.
export default async function AdvocatePage({
  params,
}: {
  params: { barId: string[] };
}) {
  if (!ldEnabled()) notFound();
  const t = await getTranslations("advocate");
  const barId = params.barId.map(decodeURIComponent).join("/");
  const profile = await getAdvocateProfile(barId);
  if (!profile) notFound();

  // ── Which of these CNRs does the firm already track? ──────────────────────
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  const cnrs = profile.cases.map((c) => c.cnr).filter(Boolean);
  const { data: tracked } = tenantId && cnrs.length
    ? await supabase
        .from("matter")
        .select("id, cnr")
        .eq("tenant_id", tenantId)
        .in("cnr", cnrs)
    : { data: [] };
  const byCnr = new Map((tracked ?? []).map((m) => [m.cnr, m.id]));

  // ── Core aggregations ─────────────────────────────────────────────────────
  const pending = profile.cases.filter(
    (c) => (c.status ?? "").toUpperCase() === "PENDING"
  ).length;

  // Side split (petitioner vs respondent)
  const sideCounts = new Map<string, number>();
  for (const c of profile.cases) {
    const side = (c.side ?? "UNKNOWN").toUpperCase();
    sideCounts.set(side, (sideCounts.get(side) ?? 0) + 1);
  }
  const petitioner = sideCounts.get("PETITIONER") ?? sideCounts.get("PET") ?? 0;
  const respondent = sideCounts.get("RESPONDENT") ?? sideCounts.get("RES") ?? 0;
  const totalSided = petitioner + respondent;

  // Case-type breakdown (top 8)
  const byType = new Map<string, number>();
  for (const c of profile.cases) {
    const ct = (c.case_type ?? "—").split("(")[0].trim();
    byType.set(ct, (byType.get(ct) ?? 0) + 1);
  }
  const topTypes = [...byType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  // Tier breakdown
  const byTier = new Map<string, number>();
  for (const c of profile.cases) {
    const tier = (c.tier ?? "UNKNOWN").trim();
    byTier.set(tier, (byTier.get(tier) ?? 0) + 1);
  }

  // Registration-year seniority (from profile or inferred from earliest case)
  const regYear =
    profile.registration_year ??
    (profile.cases.length
      ? profile.cases.reduce<number | null>((min, c) => {
          const yr = c.registration_year;
          return yr && (!min || yr < min) ? yr : min;
        }, null)
      : null);
  const seniority = regYear
    ? new Date().getFullYear() - regYear
    : null;

  // Judge cross-links: count appearances by judge (from recent hearing data if available)
  // The API may not always return per-case judge names; we surface what we have.
  const byJudge = new Map<string, { count: number; judgeId?: string }>();
  // (judge data is not guaranteed from the /advocate/ endpoint — flag as data gap if absent)
  const hasJudgeData = profile.cases.some((c) => (c as { judge_name?: string }).judge_name);

  // Aliases (deduplicated, primary name excluded)
  const primaryName = profile.names[0] ?? "";
  const aliases = profile.names.slice(1).filter(
    (n) => n.trim() && n.toUpperCase() !== primaryName.toUpperCase()
  );

  // Tier chip tone
  const tierTone = (tier: string): "brand" | "neutral" =>
    TIER_TONE[tier] ?? "neutral";

  return (
    <div className="space-y-6">
      {/* ── Back link ──────────────────────────────────────────────────────── */}
      <Link
        href="/dashboard/lookup"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ec-brass-deep hover:text-ec-brass"
      >
        <Icon name="back" className="h-4 w-4" />
        {t("backToLookup")}
      </Link>

      {/* ── Page header with alias chips inline ──────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[1.6rem] font-semibold leading-tight">
            {primaryName || t("nameFallback", { barId: profile.bar_id })}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="ec-chip">{t("barLabel", { barId: profile.bar_id })}</span>
            {regYear && (
              <span className="ec-chip ec-chip-success">
                {t("seniorityLabel", { year: regYear, years: seniority ?? 0 })}
              </span>
            )}
            {aliases.length > 0 && (
              <>
                <span className="text-xs text-ink-faint">{t("aliasesLabel")}</span>
                {aliases.map((alias) => (
                  <span key={alias} className="ec-chip">
                    {alias}
                  </span>
                ))}
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Stat tiles ─────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <div className="px-4 py-3">
            <p className="label">{t("totalCases")}</p>
            <p className="text-2xl font-semibold">{profile.case_count}</p>
          </div>
        </Card>
        <Card>
          <div className="px-4 py-3">
            <p className="label">{t("pending")}</p>
            <p className="text-2xl font-semibold">{pending}</p>
          </div>
        </Card>
        <Card>
          <div className="px-4 py-3">
            <p className="label">{t("disposed")}</p>
            <p className="text-2xl font-semibold">{profile.case_count - pending}</p>
          </div>
        </Card>
        <Card>
          <div className="px-4 py-3">
            <p className="label">{t("showing")}</p>
            <p className="text-2xl font-semibold">{profile.cases.length}</p>
          </div>
        </Card>
      </section>

      {/* ── Two-column analytics + caseload ──────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Left sidebar: breakdown panels ─────────────────────────────── */}
        <div className="space-y-6 lg:order-last">

          {/* Side split (petitioner vs respondent) */}
          {totalSided > 0 && (
            <Card>
              <div className="border-b border-line px-5 py-4">
                <p className="font-medium">{t("sideSplitTitle")}</p>
                <p className="mt-0.5 text-xs text-ink-faint">{t("sample")}</p>
              </div>
              <div className="px-5 py-4">
                {/* Visual side bar */}
                <div className="mb-3 h-3 w-full overflow-hidden rounded-full bg-paper-3">
                  <div
                    className="h-3 rounded-full bg-brand-500"
                    style={{
                      width: `${Math.round((petitioner / totalSided) * 100)}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between text-xs">
                  <div>
                    <span className="font-semibold text-brand-600">{petitioner}</span>{" "}
                    <span className="text-ink-faint">{t("asPetitioner")}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-semibold text-ink-soft">{respondent}</span>{" "}
                    <span className="text-ink-faint">{t("asRespondent")}</span>
                  </div>
                </div>
                {sideCounts.size > 2 && (
                  <p className="mt-2 text-xs text-ink-faint">
                    {t("otherSides", {
                      n: [...sideCounts.entries()]
                        .filter(
                          ([s]) =>
                            s !== "PETITIONER" &&
                            s !== "PET" &&
                            s !== "RESPONDENT" &&
                            s !== "RES"
                        )
                        .reduce((sum, [, c]) => sum + c, 0),
                    })}
                  </p>
                )}
              </div>
            </Card>
          )}

          {/* Case-type breakdown chips */}
          {topTypes.length > 0 && (
            <Card>
              <div className="border-b border-line px-5 py-4">
                <p className="font-medium">{t("caseTypeBreakdownTitle")}</p>
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
          )}

          {/* Tier breakdown */}
          {byTier.size > 0 && (
            <Card>
              <div className="border-b border-line px-5 py-4">
                <p className="font-medium">{t("tierBreakdownTitle")}</p>
              </div>
              <ul className="divide-y divide-line text-sm">
                {[...byTier.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([tier, n]) => (
                    <li
                      key={tier}
                      className="flex items-center justify-between px-5 py-2.5"
                    >
                      <Badge tone={tierTone(tier)}>{tier}</Badge>
                      <span className="num text-xs text-ink-faint">{n}</span>
                    </li>
                  ))}
              </ul>
            </Card>
          )}

          {/* Judge cross-links — data gap if not available */}
          {hasJudgeData && byJudge.size > 0 ? (
            <Card>
              <div className="border-b border-line px-5 py-4">
                <p className="font-medium">{t("topJudgesTitle")}</p>
                <p className="mt-0.5 text-xs text-ink-faint">{t("topJudgesHelp")}</p>
              </div>
              <ul className="divide-y divide-line text-sm">
                {[...byJudge.entries()]
                  .sort((a, b) => b[1].count - a[1].count)
                  .slice(0, 8)
                  .map(([name, { count, judgeId }], i) => (
                    <li
                      key={name}
                      className="flex items-center justify-between gap-3 px-5 py-2.5"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="num w-5 shrink-0 text-xs text-ink-faint">
                          {i + 1}
                        </span>
                        {judgeId ? (
                          <Link
                            href={`/dashboard/judge/${judgeId}`}
                            className="min-w-0 truncate font-medium text-brand-600 hover:underline"
                          >
                            {name}
                          </Link>
                        ) : (
                          <Link
                            href={`/dashboard/lookup?q=${encodeURIComponent(name)}`}
                            className="min-w-0 truncate font-medium text-brand-600 hover:underline"
                          >
                            {name}
                          </Link>
                        )}
                      </span>
                      <span className="num shrink-0 text-xs text-ink-faint">{count}</span>
                    </li>
                  ))}
              </ul>
            </Card>
          ) : (
            <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
              <span className="font-semibold">{t("dataGapLabel")}</span>{" "}
              {t("dataGapJudges")}
            </div>
          )}
        </div>

        {/* ── Caseload table (main column) ───────────────────────────────── */}
        <div className="lg:col-span-2">
          <Card>
            <div className="border-b border-line px-5 py-4">
              <p className="font-medium">
                {t("caseload")}{" "}
                <span className="text-ink-faint">
                  {t("showingOf", {
                    count: profile.cases.length,
                    total: profile.case_count,
                  })}
                </span>
              </p>
            </div>
            {profile.cases.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-ink-faint">
                      <th className="px-5 py-2 font-medium">{t("colCnr")}</th>
                      <th className="px-3 py-2 font-medium">{t("colType")}</th>
                      <th className="px-3 py-2 font-medium">{t("colSide")}</th>
                      <th className="px-3 py-2 font-medium">{t("colTier")}</th>
                      <th className="px-3 py-2 font-medium">{t("colStatus")}</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {profile.cases.map((c) => {
                      const mid = byCnr.get(c.cnr);
                      return (
                        <tr key={c.cnr} className="border-t border-line hover:bg-paper">
                          <td className="px-5 py-2 font-mono text-xs">
                            {mid ? (
                              <Link
                                href={`/dashboard/cases/${mid}`}
                                className="text-brand-600 hover:underline"
                              >
                                {c.cnr}
                              </Link>
                            ) : (
                              c.cnr
                            )}
                          </td>
                          <td className="px-3 py-2 text-ink-soft">
                            {c.case_type?.split("(")[0].trim() ?? "—"}
                            {c.registration_year ? (
                              <span className="ml-1 text-xs text-ink-faint">
                                ({c.registration_year})
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">
                            {c.side ? (
                              <span
                                className={`ec-chip ${
                                  (c.side ?? "").toUpperCase().startsWith("PET")
                                    ? "ec-chip-success"
                                    : ""
                                }`}
                              >
                                {c.side}
                              </span>
                            ) : (
                              <span className="text-ink-faint">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {c.tier ? (
                              <Badge tone={tierTone(c.tier)}>{c.tier}</Badge>
                            ) : (
                              <span className="text-ink-faint">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              tone={
                                (c.status ?? "").toUpperCase() === "PENDING"
                                  ? "amber"
                                  : "green"
                              }
                            >
                              {c.status}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-right">
                            {mid ? (
                              <span className="text-xs text-ink-faint">{t("tracked")}</span>
                            ) : (
                              <TrackCaseButton cnr={c.cnr} />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon="scale" title={t("emptyTitle")} body={t("emptyBody")} />
            )}
            <p className="px-5 py-3 text-xs text-ink-faint">{t("sourceNote")}</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
