import Link from "next/link";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/icons";
import { AddCaseForm } from "./add-case-form";
import { CourtProviderBanner } from "@/components/court-provider-banner";
import { Console, type SavedView } from "./console";
import { CasesTable } from "./cases-table";
import { CasesTabs } from "./cases-tabs";
import { CasesTierTabs } from "./cases-tier-tabs";
import { Pagination } from "@/components/pagination";
import { fetchCasesPage, fetchViewCounts, fetchTierCounts, type CasesFilters } from "./cases-query";
import { parseDensity, DENSITY_COOKIE } from "./density";
import { parsePage, clampPerPage } from "@/lib/paginate";
import { maskTitle } from "@/lib/court/mask";
import { sanitizeTrack } from "@/lib/auth/redirects";

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

type Search = CasesFilters & { page?: string; per?: string; track?: string };

export default async function CasesPage({ searchParams }: { searchParams: Search }) {
  const supabase = createClient();
  const t = await getTranslations("cases");
  const tc = await getTranslations("common");
  const { q, tier, court, case_type, stage, status, advocate, act, next, sort } = searchParams;
  const filters: CasesFilters = { q, tier, court, case_type, stage, status, advocate, act, next, sort };
  const page = parsePage(searchParams.page);
  const per = clampPerPage(searchParams.per);
  const today = isoDay(new Date());
  // WO-54 W4: per-user list density from the cookie → correct first paint (no hydration flash).
  const density = parseDensity(cookies().get(DENSITY_COOKIE)?.value);

  // Numbered-page pagination (WO-39): fetch just this page's slice + an exact total count.
  // Was `.limit(500)` silent truncation. Facets/views still read the wider set — a facet RPC
  // to replace the 1000-row scan is the founder-gated follow-up.
  const [{ rows: matters, total }, { data: facetRows }, { data: viewRows }, viewCounts, tierCounts] = await Promise.all([
    fetchCasesPage(supabase, filters, page, per),
    supabase.from("matter").select("court, case_type, stage, advocate_names, act_names").limit(1000),
    supabase
      .from("saved_view")
      .select("id, name, query")
      .eq("kind", "cases")
      .order("created_at", { ascending: true }),
    fetchViewCounts(supabase),
    fetchTierCounts(supabase),
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

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-[1.6rem] font-medium leading-tight tracking-tight text-ec-ink">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ec-ink-3">{t("subtitle")}</p>
      </header>

      <CourtProviderBanner />

      <div className="ec-card p-5">
        {/* ?track=<CNR> — the login deep link (WO-50/WO-51): prefill + auto-submit
            the add-by-CNR form so "track this case" survives the auth round-trip. */}
        <AddCaseForm autoCnr={sanitizeTrack(searchParams.track) ?? undefined} />
      </div>

      <Console courts={courts} caseTypes={caseTypes} stages={stages} advocates={advocates} acts={acts} />

      {/* WO-54 W2: court-tier segmentation (primary axis) sits above the saved-view tabs. */}
      <div className="space-y-2.5">
        <CasesTierTabs counts={tierCounts} />
        <CasesTabs counts={viewCounts} views={views} />
      </div>

      {total > 0 ? (
        <>
          <div className="num flex items-center justify-between px-1 text-xs text-ec-ink-3">
            <span>{t("count", { count: total })}{activeFilters ? ` · ${t("filtered")}` : ""}</span>
            {activeFilters && (
              <Link href="/dashboard/cases" className="inline-flex items-center gap-1 hover:text-ec-brass-deep">
                <Icon name="refresh" className="h-3.5 w-3.5" /> {t("clearFilters")}
              </Link>
            )}
          </div>

          <CasesTable rows={matters} today={today} stages={stages} initialDensity={density} />

          <Pagination page={page} perPage={per} total={total} />
        </>
      ) : (
        <div className="ec-card flex flex-col items-center justify-center px-6 py-14 text-center">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-ec-m bg-ec-brass-tint text-ec-brass-deep">
            <Icon name="cases" className="h-5 w-5" />
          </span>
          <h3 className="font-display text-lg font-medium text-ec-ink">{activeFilters ? t("empty.filteredTitle") : t("empty.title")}</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-ec-ink-3">{activeFilters ? t("empty.filteredBody") : t("empty.body")}</p>
        </div>
      )}

      <p className="flex items-center gap-1.5 text-xs text-ec-ink-3">
        <Icon name="alert" className="h-3.5 w-3.5" /> {tc("disclaimer")}
      </p>
    </div>
  );
}
