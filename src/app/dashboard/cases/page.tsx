import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Badge, EmptyState, Disclaimer, fmtDate, fmtAgo } from "@/components/ui";
import { Icon } from "@/components/icons";
import { AddCaseForm } from "./add-case-form";
import { Console, type SavedView } from "./console";
import { ConfirmDelete } from "@/components/confirm-delete";
import { deleteMatter } from "./actions";

type Search = {
  q?: string;
  court?: string;
  case_type?: string;
  stage?: string;
  status?: string;
  advocate?: string;
  act?: string;
  next?: string;
  sort?: string;
};

// YYYY-MM-DD for date comparisons against next_hearing_date (a date column).
function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function CasesPage({ searchParams }: { searchParams: Search }) {
  const supabase = createClient();
  const { q, court, case_type, stage, status, advocate, act, next, sort } = searchParams;
  const today = isoDay(new Date());

  let query = supabase
    .from("matter")
    .select(
      "id, cnr, title, court, case_type, stage, status, next_hearing_date, last_synced_at, source, party_names",
    )
    .limit(500);

  if (q) {
    const term = q.replace(/[%,()]/g, " ").trim();
    if (term) {
      query = query.or(
        `title.ilike.%${term}%,cnr.ilike.%${term}%,court.ilike.%${term}%,party_names.cs.{${term}}`,
      );
    }
  }
  if (court) query = query.eq("court", court);
  if (case_type) query = query.eq("case_type", case_type);
  if (stage) query = query.eq("stage", stage);
  if (status) query = query.eq("status", status);
  if (advocate) query = query.contains("advocate_names", [advocate]);
  if (act) query = query.contains("act_names", [act]);

  if (next === "overdue") query = query.lt("next_hearing_date", today);
  else if (next === "none") query = query.is("next_hearing_date", null);
  else if (next === "7d") {
    const end = new Date();
    end.setDate(end.getDate() + 7);
    query = query.gte("next_hearing_date", today).lte("next_hearing_date", isoDay(end));
  } else if (next === "30d") {
    const end = new Date();
    end.setDate(end.getDate() + 30);
    query = query.gte("next_hearing_date", today).lte("next_hearing_date", isoDay(end));
  }

  if (sort === "created_at") query = query.order("created_at", { ascending: false });
  else if (sort === "title") query = query.order("title", { ascending: true });
  else query = query.order("next_hearing_date", { ascending: true, nullsFirst: false });

  // Distinct dropdown values come from the full (unfiltered) matter set, plus saved views.
  const [{ data: matters }, { data: facetRows }, { data: viewRows }] = await Promise.all([
    query,
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
    <div className="space-y-7">
      <PageHeader title="Cases" subtitle="Add a case by CNR; we fetch its details and keep it fresh on a nightly sync." />

      <Card className="p-5">
        <AddCaseForm />
      </Card>

      <Console courts={courts} caseTypes={caseTypes} stages={stages} advocates={advocates} acts={acts} views={views} />

      {matters && matters.length > 0 ? (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-2.5 text-xs text-ink-faint">
            <span>
              {matters.length} case{matters.length === 1 ? "" : "s"}
              {activeFilters ? " · filtered" : ""}
            </span>
            {activeFilters && (
              <Link href="/dashboard/cases" className="inline-flex items-center gap-1 hover:text-brand-700">
                <Icon name="refresh" className="h-3.5 w-3.5" /> Clear filters
              </Link>
            )}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-5 py-3 label">Case</th>
                <th className="hidden px-5 py-3 label md:table-cell">Court</th>
                <th className="hidden px-5 py-3 label sm:table-cell">Stage</th>
                <th className="hidden px-5 py-3 label sm:table-cell">Status</th>
                <th className="px-5 py-3 label">Next hearing</th>
                <th className="hidden px-5 py-3 label lg:table-cell">Source</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {matters.map((m) => {
                const overdue = m.next_hearing_date != null && m.next_hearing_date < today;
                return (
                  <tr key={m.id} className="group border-b border-line last:border-0 transition hover:bg-paper">
                    <td className="px-5 py-3.5">
                      <Link href={`/dashboard/cases/${m.id}`} className="font-medium text-ink group-hover:text-brand-600">
                        {m.title}
                      </Link>
                      {m.cnr && <div className="mt-0.5 font-mono text-[0.7rem] text-ink-faint">{m.cnr}</div>}
                    </td>
                    <td className="hidden px-5 py-3.5 text-ink-muted md:table-cell">{m.court ?? "—"}</td>
                    <td className="hidden px-5 py-3.5 sm:table-cell">{m.stage ? <Badge>{m.stage}</Badge> : <span className="text-ink-faint">—</span>}</td>
                    <td className="hidden px-5 py-3.5 sm:table-cell">
                      {m.status ? <Badge tone={m.status === "disposed" ? "neutral" : "green"}>{m.status}</Badge> : <span className="text-ink-faint">—</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={overdue ? "font-medium text-amber-700" : "text-ink-soft"}>{fmtDate(m.next_hearing_date)}</span>
                    </td>
                    <td className="hidden px-5 py-3.5 text-xs text-ink-faint lg:table-cell">{m.source ?? "—"} · {fmtAgo(m.last_synced_at)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <ConfirmDelete action={deleteMatter} id={m.id} label="" confirmLabel="Delete case" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : (
        <EmptyState
          icon="cases"
          title={activeFilters ? "No matching cases" : "No cases yet"}
          body={activeFilters ? "Try a different search or clear the filters." : "Add your first case by CNR above — its hearings, parties and orders will sync automatically."}
        />
      )}

      <Disclaimer />
    </div>
  );
}
