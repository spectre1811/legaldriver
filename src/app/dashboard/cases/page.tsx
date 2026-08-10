import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/icons";
import { CasesToolbar } from "./cases-toolbar";
import { CasesTable } from "./cases-table";
import { CasesAttention } from "./cases-attention";
import { CasesNavProvider, PendingDim } from "./cases-nav-provider";
import { CasesPagination } from "./cases-pagination";
import { fetchCasesPage, fetchViewCounts, fetchTierCounts, type CasesFilters } from "./cases-query";
import type { SavedView } from "./cases-nav";
import { parseDensity, DENSITY_COOKIE } from "./density";
import { parsePage, clampPerPage } from "@/lib/paginate";
import { sanitizeTrack } from "@/lib/auth/redirects";
import { Reveal } from "../motion";

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

type Search = CasesFilters & { page?: string; per?: string; track?: string; add?: string };

export default async function CasesPage({ searchParams }: { searchParams: Search }) {
  const supabase = createClient();
  const t = await getTranslations("cases");
  const tc = await getTranslations("common");
  const { q, tier, court, case_type, stage, status, statuses, advocate, act, judge, next, sort } = searchParams;
  // WO-331 EXACT-FIDELITY: the reference's status segment starts on "Open" and the list is
  // ACTUALLY filtered to it (not just the segmented control's active pixel) — an absent `status`
  // param now defaults the real query to "open" too, so a fresh /dashboard/cases visit shows the
  // same open-only list the reference does. `activeFilters` below still reads the RAW `status` so
  // this default is never counted as a user-applied filter for the empty-state copy.
  const filters: CasesFilters = { q, tier, court, case_type, stage, status: status ?? "open", statuses, advocate, act, judge, next, sort };
  const page = parsePage(searchParams.page);
  const per = clampPerPage(searchParams.per);
  const today = isoDay(new Date());
  // WO-54 W4: per-user list density from the cookie → correct first paint (no hydration flash).
  const density = parseDensity(cookies().get(DENSITY_COOKIE)?.value);

  // WO-54 W2b: the facet option lists are scoped to the ACTIVE TIER (uses matter_tier_idx) so the
  // dropdowns adapt per tier — on the High Court tab you only see HC courts/case-types, etc.
  // WO-331 EXACT-FIDELITY: trimmed to the 3 facets the reference's Filters drawer actually has
  // (Court / Case type / Stage) — advocate_names/act_names/judge_names/status are no longer
  // surfaced as editable facets (see cases-toolbar.tsx's file-level trade-off note); dropping them
  // from the SELECT too so this stays a real, not just cosmetic, simplification.
  let facetQuery = supabase.from("matter").select("court, case_type, stage").limit(1000);
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
    fetchTierCounts(supabase, filters.status),
  ]);

  const distinct = (key: "court" | "case_type" | "stage") =>
    [...new Set((facetRows ?? []).map((r) => r[key]).filter(Boolean) as string[])].sort();
  const courts = distinct("court");
  const caseTypes = distinct("case_type");
  const stages = distinct("stage");

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
      {/* WO-342: dark ink engraved masthead — matches Overview/Directory's shipped treatment
          (today-view.tsx) instead of forking a light header; count moves into the honey mono
          pill on the ink-chip token (AppMasthead's title-slot count, design-mockups/iteration3/
          console/app-shell.tsx). WO-346: unrounded (the reference's ink band is square/edge-to-edge). */}
      <Reveal as="div" className="mk-engraved bg-ec-ink px-5 py-7 text-ec-paper sm:px-8">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="font-display text-[28px] leading-tight text-ec-paper sm:text-[32px]">{t("title")}</h1>
          {total > 0 && (
            <span className="num rounded-md bg-ec-ink-chip px-2 py-0.5 font-mono text-[12px] text-ec-honey">{total}</span>
          )}
        </div>
        <p className="mt-1.5 text-[13px] text-ec-line-strong">{t("subtitle")}</p>
      </Reveal>

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
          tierCounts={tierCounts}
          views={views}
          autoCnr={sanitizeTrack(searchParams.track) ?? undefined}
          autoOpen={searchParams.add === "1"}
        />

        <PendingDim>
          {total > 0 ? (
            <div className="space-y-6">
              <CasesTable rows={matters} today={today} stages={stages} initialDensity={density} />
              <CasesPagination page={page} perPage={per} total={total} />
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
