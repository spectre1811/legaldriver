import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/icons";
import { CasesToolbar } from "./cases-toolbar";
import { CasesTable } from "./cases-table";
import { CasesAttention } from "./cases-attention";
import { CasesNavProvider, PendingDim } from "./cases-nav-provider";
import { Pagination } from "@/components/pagination";
import { fetchCasesPage, fetchViewCounts, fetchTierCounts, type CasesFilters } from "./cases-query";
import { groupFacet, advocateKey, actKey } from "./facet-normalize";
import type { SavedView } from "./cases-nav";
import { parseDensity, DENSITY_COOKIE } from "./density";
import { parsePage, clampPerPage } from "@/lib/paginate";
import { sanitizeTrack } from "@/lib/auth/redirects";

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

type Search = CasesFilters & { page?: string; per?: string; track?: string };

export default async function CasesPage({ searchParams }: { searchParams: Search }) {
  const supabase = createClient();
  const t = await getTranslations("cases");
  const tc = await getTranslations("common");
  const { q, tier, court, case_type, stage, status, statuses, advocate, act, judge, next, sort } = searchParams;
  const filters: CasesFilters = { q, tier, court, case_type, stage, status, statuses, advocate, act, judge, next, sort };
  const page = parsePage(searchParams.page);
  const per = clampPerPage(searchParams.per);
  const today = isoDay(new Date());
  // WO-54 W4: per-user list density from the cookie → correct first paint (no hydration flash).
  const density = parseDensity(cookies().get(DENSITY_COOKIE)?.value);

  // WO-54 W2b: the facet option lists are scoped to the ACTIVE TIER (uses matter_tier_idx) so the
  // dropdowns adapt per tier — on the High Court tab you only see HC courts/case-types/judges, etc.
  let facetQuery = supabase.from("matter").select("court, case_type, stage, status, advocate_names, act_names, judge_names").limit(1000);
  if (tier) facetQuery = facetQuery.eq("tier", tier);
  const [{ rows: matters, total }, { data: facetRows }, { data: viewRows }, viewCounts, tierCounts] = await Promise.all([
    fetchCasesPage(supabase, filters, page, per),
    facetQuery,
    supabase
      .from("saved_view")
      .select("id, name, query")
      .eq("kind", "cases")
      .order("created_at", { ascending: true }),
    fetchViewCounts(supabase),
    fetchTierCounts(supabase),
  ]);

  const distinct = (key: "court" | "case_type" | "stage" | "status") =>
    [...new Set((facetRows ?? []).map((r) => r[key]).filter(Boolean) as string[])].sort();
  const courts = distinct("court");
  const caseTypes = distinct("case_type");
  const stages = distinct("stage");
  // Real distinct status strings as stored ("Pending"/"Disposed"/…) — the "according to cases"
  // status filter (WO-59), separate from the Open/Disposed semantic segment.
  const statusValues = distinct("status");

  const distinctArray = (key: "advocate_names" | "act_names" | "judge_names") =>
    [...new Set((facetRows ?? []).flatMap((r) => (r[key] ?? []) as string[]).filter(Boolean))].sort();
  // WO-57: collapse surface-only spelling variants of one advocate/act into a single facet option
  // that expands back to every raw variant on match (query builder unchanged — still overlaps).
  const advocateGroups = groupFacet(distinctArray("advocate_names"), advocateKey);
  const actGroups = groupFacet(distinctArray("act_names"), actKey);
  const judges = distinctArray("judge_names"); // WO-54 W2b: Judge facet (tier-scoped like the rest)

  const views: SavedView[] = (viewRows ?? []).map((v) => ({
    id: v.id,
    name: v.name,
    query: (v.query && typeof v.query === "object" && !Array.isArray(v.query)
      ? (v.query as Record<string, string | string[]>)
      : {}),
  }));

  const activeFilters = Boolean(q || tier || court || case_type || stage || status || statuses || advocate || act || judge || next || sort);

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2.5">
          <h1 className="font-display text-[1.6rem] font-medium leading-tight tracking-tight text-ec-ink">{t("title")}</h1>
          {total > 0 && <span className="num rounded-ec-s bg-ec-paper-3 px-2 py-0.5 text-sm text-ec-ink-3">{total}</span>}
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ec-ink-3">{t("subtitle")}</p>
      </header>

      {/* One shared filter-nav transition for every control below → PendingDim can dim the whole
          results region while a filter change refetches (slice-2 "shared pending"). */}
      <CasesNavProvider>
        <CasesAttention counts={viewCounts} />

        {/* ?track=<CNR> — the login deep link (WO-50/WO-51): the toolbar's Add-case modal auto-opens
            and auto-submits so "track this case" survives the auth round-trip. */}
        <CasesToolbar
          courts={courts}
          caseTypes={caseTypes}
          stages={stages}
          statuses={statusValues}
          advocateGroups={advocateGroups}
          actGroups={actGroups}
          judges={judges}
          tierCounts={tierCounts}
          viewCounts={viewCounts}
          views={views}
          autoCnr={sanitizeTrack(searchParams.track) ?? undefined}
        />

        <PendingDim>
          {total > 0 ? (
            <div className="space-y-6">
              <CasesTable rows={matters} today={today} stages={stages} initialDensity={density} />
              <Pagination page={page} perPage={per} total={total} />
            </div>
          ) : (
            <div className="ec-card flex flex-col items-center justify-center px-6 py-14 text-center">
              <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-ec-m bg-ec-bronze-tint text-ec-bronze-deep">
                <Icon name="cases" className="h-5 w-5" />
              </span>
              <h3 className="font-display text-lg font-medium text-ec-ink">{activeFilters ? t("empty.filteredTitle") : t("empty.title")}</h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-ec-ink-3">{activeFilters ? t("empty.filteredBody") : t("empty.body")}</p>
            </div>
          )}
        </PendingDim>
      </CasesNavProvider>

      <p className="flex items-center gap-1.5 text-xs text-ec-ink-3">
        <Icon name="alert" className="h-3.5 w-3.5" /> {tc("disclaimer")}
      </p>
    </div>
  );
}
