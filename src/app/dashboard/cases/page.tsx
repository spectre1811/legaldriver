import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtAgo } from "@/components/ui";
import { Icon } from "@/components/icons";
import { cleanPurpose } from "@/lib/court/code-labels";
import { AddCaseForm } from "./add-case-form";
import { CourtProviderBanner } from "@/components/court-provider-banner";
import { Console, type SavedView } from "./console";
import { ConfirmDelete } from "@/components/confirm-delete";
import { deleteMatter } from "./actions";
import { Pagination } from "@/components/pagination";
import { fetchCasesPage, type CasesFilters } from "./cases-query";
import { parsePage, clampPerPage } from "@/lib/paginate";

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

type Search = CasesFilters & { page?: string; per?: string };

export default async function CasesPage({ searchParams }: { searchParams: Search }) {
  const supabase = createClient();
  const t = await getTranslations("cases");
  const tc = await getTranslations("common");
  const te = await getTranslations("enum");
  const st = (v: string) => (te.has(`status.${v}`) ? te(`status.${v}`) : v);
  const { q, court, case_type, stage, status, advocate, act, next, sort } = searchParams;
  const filters: CasesFilters = { q, court, case_type, stage, status, advocate, act, next, sort };
  const page = parsePage(searchParams.page);
  const per = clampPerPage(searchParams.per);
  const today = isoDay(new Date());

  // Numbered-page pagination (WO-39): fetch just this page's slice + an exact total count.
  // Was `.limit(500)` silent truncation. Facets/views still read the wider set — a facet RPC
  // to replace the 1000-row scan is the founder-gated follow-up.
  const [{ rows: matters, total }, { data: facetRows }, { data: viewRows }] = await Promise.all([
    fetchCasesPage(supabase, filters, page, per),
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

      {total > 0 ? (
        <>
          <div className="ec-card overflow-hidden">
            <div className="num flex items-center justify-between border-b border-ec-hair px-5 py-2.5 text-xs text-ec-ink-3">
              <span>{t("count", { count: total })}{activeFilters ? ` · ${t("filtered")}` : ""}</span>
              {activeFilters && (
                <Link href="/dashboard/cases" className="inline-flex items-center gap-1 hover:text-ec-brass-deep">
                  <Icon name="refresh" className="h-3.5 w-3.5" /> {t("clearFilters")}
                </Link>
              )}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ec-hair-strong text-left">
                  <th className="ec-label px-5 py-3">{t("th.case")}</th>
                  <th className="ec-label hidden px-5 py-3 lg:table-cell">{t("th.client")}</th>
                  <th className="ec-label hidden px-5 py-3 md:table-cell">{t("th.court")}</th>
                  <th className="ec-label hidden px-5 py-3 sm:table-cell">{t("th.stage")}</th>
                  <th className="ec-label hidden px-5 py-3 sm:table-cell">{t("th.status")}</th>
                  <th className="ec-label px-5 py-3">{t("th.next")}</th>
                  <th className="ec-label hidden px-5 py-3 lg:table-cell">{t("th.source")}</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {matters.map((m) => {
                  const eff = m.next_hearing_override ?? m.next_hearing_date;
                  const overdue = eff != null && eff < today;
                  return (
                    <tr key={m.id} className="ec-row group border-b border-ec-hair last:border-0">
                      <td className="px-5 py-3.5">
                        <Link href={`/dashboard/cases/${m.id}`} className="font-display font-medium text-ec-ink group-hover:text-ec-brass-deep">
                          {m.title}
                        </Link>
                        {m.cnr && <div className="num mt-0.5 text-[0.7rem] text-ec-ink-3">{m.cnr}</div>}
                      </td>
                      <td className="hidden px-5 py-3.5 text-ec-ink-2 lg:table-cell">{m.client?.name ?? <span className="text-ec-ink-3">—</span>}</td>
                      <td className="hidden px-5 py-3.5 text-ec-ink-2 md:table-cell">{m.court ?? "—"}</td>
                      <td className="hidden px-5 py-3.5 sm:table-cell">{m.stage ? <span className="ec-chip" title={m.stage}>{cleanPurpose(m.stage)}</span> : <span className="text-ec-ink-3">—</span>}</td>
                      <td className="hidden px-5 py-3.5 sm:table-cell">
                        {m.status ? <span className={`ec-chip ${m.status === "disposed" ? "" : "ec-chip-hot"}`}>{st(m.status)}</span> : <span className="text-ec-ink-3">—</span>}
                      </td>
                      <td className="num px-5 py-3.5">
                        {eff ? <span className={overdue ? "font-medium text-ec-danger" : "text-ec-ink-2"}>{fmtDate(eff)}{m.next_hearing_override ? ` · ${t("diary")}` : ""}{overdue ? ` · ${t("past")}` : ""}</span> : <span className="text-xs text-ec-ink-3">{t("noDate")}</span>}
                      </td>
                      <td className="num hidden px-5 py-3.5 text-xs text-ec-ink-3 lg:table-cell">{m.source ?? "—"} · {fmtAgo(m.last_synced_at)}</td>
                      <td className="px-5 py-3.5 text-right">
                        <ConfirmDelete action={deleteMatter} id={m.id} label="" confirmLabel={t("delete")} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

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
