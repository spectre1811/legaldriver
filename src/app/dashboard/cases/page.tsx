import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/icons";
import { AddCaseForm } from "./add-case-form";
import { CourtProviderBanner } from "@/components/court-provider-banner";
import { Console, type SavedView } from "./console";
import { CasesTable } from "./cases-table";
import { fetchCasesPage, type CasesFilters } from "./cases-query";

export default async function CasesPage({ searchParams }: { searchParams: CasesFilters }) {
  const supabase = createClient();
  const t = await getTranslations("cases");
  const tc = await getTranslations("common");
  const { q, court, case_type, stage, status, advocate, act, next, sort } = searchParams;
  const filters: CasesFilters = { q, court, case_type, stage, status, advocate, act, next, sort };

  // Offset-paginated (WO-39): first page only; "Load more" pulls the rest via the
  // loadMoreCases server action (replays the same filters + sort). Was `.limit(500)`
  // silent truncation. Facets/views still read the wider set — a facet RPC to replace
  // the 1000-row scan is the founder-gated follow-up.
  const [firstPage, { data: facetRows }, { data: viewRows }] = await Promise.all([
    fetchCasesPage(supabase, filters),
    supabase.from("matter").select("court, case_type, stage, advocate_names, act_names").limit(1000),
    supabase
      .from("saved_view")
      .select("id, name, query")
      .eq("kind", "cases")
      .order("created_at", { ascending: true }),
  ]);

  const distinct = (key: "court" | "case_type" | "stage") =>
    [...new Set((facetRows ?? []).map((r) => r[key]).filter(Boolean) as string[])].sort();
  const courts = distinct("court");
  const caseTypes = distinct("case_type");
  const stages = distinct("stage");

  const distinctArray = (key: "advocate_names" | "act_names") =>
    [...new Set((facetRows ?? []).flatMap((r) => (r[key] ?? []) as string[]).filter(Boolean))].sort();
  const advocates = distinctArray("advocate_names");
  const acts = distinctArray("act_names");

  const views: SavedView[] = (viewRows ?? []).map((v) => ({
    id: v.id,
    name: v.name,
    query: (v.query && typeof v.query === "object" && !Array.isArray(v.query)
      ? (v.query as Record<string, string>)
      : {}),
  }));

  const activeFilters = Boolean(q || court || case_type || stage || status || advocate || act || next || sort);
  // Remount CasesTable when the filters change so it starts a fresh first page rather
  // than appending onto stale rows.
  const filterKey = JSON.stringify(filters);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-[1.6rem] font-medium leading-tight tracking-tight text-ec-ink">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ec-ink-3">{t("subtitle")}</p>
      </header>

      <CourtProviderBanner />

      <div className="ec-card p-5">
        <AddCaseForm />
      </div>

      <Console courts={courts} caseTypes={caseTypes} stages={stages} advocates={advocates} acts={acts} views={views} />

      <CasesTable
        key={filterKey}
        initialRows={firstPage.rows}
        initialCursor={firstPage.nextCursor}
        filters={filters}
        activeFilters={activeFilters}
      />

      <p className="flex items-center gap-1.5 text-xs text-ec-ink-3">
        <Icon name="alert" className="h-3.5 w-3.5" /> {tc("disclaimer")}
      </p>
    </div>
  );
}
