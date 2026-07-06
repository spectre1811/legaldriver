import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { rangeFor } from "@/lib/paginate";

// Cases list query (WO-39). Numbered-page pagination: the page fetches `.range(from,to)`
// for the requested page WITH an exact count, so the control can show real page numbers +
// "showing X–Y of N". Offset/range (not keyset) because the default sort is the NULLABLE
// `next_hearing_date` (urgency order) and the user can re-sort — keyset can't serve that.

export interface CasesFilters {
  q?: string;
  court?: string;
  case_type?: string;
  stage?: string;
  status?: string;
  advocate?: string;
  act?: string;
  next?: string;
  sort?: string;
}

export interface MatterRow {
  id: string;
  cnr: string | null;
  title: string;
  court: string | null;
  case_type: string | null;
  stage: string | null;
  status: string | null;
  next_hearing_date: string | null;
  next_hearing_override: string | null;
  last_synced_at: string | null;
  source: string | null;
  party_names: string[] | null;
  // WO-54: surfaced on the row (tier/case-no) + rendered in the detail drawer without a second fetch.
  // `detail` is the eCourts jsonb (tier, district, coram, registration/filing nos, FIR, regional…);
  // the name arrays already back the facet filters. Bounded by pagination — no extra query, no N+1.
  advocate_names: string[] | null;
  act_names: string[] | null;
  judge_names: string[] | null;
  detail: Record<string, unknown> | null;
  client: { name?: string } | null;
}

const SELECT =
  "id, cnr, title, court, case_type, stage, status, next_hearing_date, next_hearing_override, last_synced_at, source, party_names, advocate_names, act_names, judge_names, detail, client:client_id(name)";

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

// Build the filtered + ordered matter query. Returns the query ready for a `.range()`,
// with an exact count so the page can render numbered pages; RLS scopes it to the tenant.
export function buildCasesQuery(supabase: SupabaseClient<Database>, f: CasesFilters) {
  const today = isoDay(new Date());
  let query = supabase.from("matter").select(SELECT, { count: "exact" });

  if (f.q) {
    const term = f.q.replace(/[%,()]/g, " ").trim();
    if (term) {
      // Mirrors the page: substring party search once migration 0030 (party_text + trigram)
      // is applied and COURT_PARTY_TEXT_SEARCH=1; else exact array-element match (WO-35 #5).
      const partyClause = process.env.COURT_PARTY_TEXT_SEARCH === "1"
        ? `party_text.ilike.%${term}%`
        : `party_names.cs.{${term}}`;
      query = query.or(
        `title.ilike.%${term}%,cnr.ilike.%${term}%,court.ilike.%${term}%,${partyClause}`,
      );
    }
  }
  if (f.court) query = query.eq("court", f.court);
  if (f.case_type) query = query.eq("case_type", f.case_type);
  if (f.stage) query = query.eq("stage", f.stage);
  if (f.status) query = query.eq("status", f.status);
  if (f.advocate) query = query.contains("advocate_names", [f.advocate]);
  if (f.act) query = query.contains("act_names", [f.act]);

  if (f.next === "overdue") query = query.lt("next_hearing_date", today);
  else if (f.next === "none") query = query.is("next_hearing_date", null);
  else if (f.next === "7d") {
    const end = new Date();
    end.setDate(end.getDate() + 7);
    query = query.gte("next_hearing_date", today).lte("next_hearing_date", isoDay(end));
  } else if (f.next === "30d") {
    const end = new Date();
    end.setDate(end.getDate() + 30);
    query = query.gte("next_hearing_date", today).lte("next_hearing_date", isoDay(end));
  }

  applySort(query, f.sort);

  return query;
}

// Sortable columns (WO-43-W2). The header cells write `sort=<key>.<dir>`; we resolve against this
// allowlist so a hostile/garbage param can never inject an ORDER BY. Legacy bare values
// (`created_at`, `title`) from older saved views still resolve. All columns are indexed
// (0036 keyset indexes) or low-cardinality; default stays urgency order (next hearing asc).
const SORT_COLUMNS: Record<string, string> = {
  next: "next_hearing_date",
  title: "title",
  court: "court",
  stage: "stage",
  status: "status",
  created: "created_at",
};

// Parse a `sort` param into a validated { column, ascending } or null (→ default order).
export function parseSort(sort?: string): { column: string; ascending: boolean } | null {
  if (!sort) return null;
  if (sort === "created_at") return { column: "created_at", ascending: false }; // legacy saved views
  if (sort === "title") return { column: "title", ascending: true };
  const [key, dir] = sort.split(".");
  const column = SORT_COLUMNS[key];
  if (!column) return null;
  return { column, ascending: dir !== "desc" };
}

function applySort<T>(query: T, sort?: string): T {
  const parsed = parseSort(sort);
  const q = query as { order: (c: string, o: object) => T };
  if (!parsed) return q.order("next_hearing_date", { ascending: true, nullsFirst: false });
  // Nullable columns sort with NULLs last regardless of direction (empties are never "most urgent").
  return q.order(parsed.column, { ascending: parsed.ascending, nullsFirst: false });
}

// Live counts for the saved-view tab strip (WO-43-W2). Each is a HEAD count (no rows transferred),
// tenant-scoped by RLS and bounded — replaces eyeballing the list. Views are navigation, so the
// counts are independent of the active free-text/facet filters.
export interface ViewCounts {
  all: number;
  open: number;
  overdue: number;
  soon: number; // next hearing within 7 days
  noDate: number;
}

export async function fetchViewCounts(supabase: SupabaseClient<Database>): Promise<ViewCounts> {
  const today = isoDay(new Date());
  const soon = new Date();
  soon.setDate(soon.getDate() + 7);
  const head = () => supabase.from("matter").select("id", { count: "exact", head: true });
  const [all, open, overdue, soonC, noDate] = await Promise.all([
    head(),
    head().eq("status", "open"),
    head().lt("next_hearing_date", today),
    head().gte("next_hearing_date", today).lte("next_hearing_date", isoDay(soon)),
    head().is("next_hearing_date", null),
  ]);
  return {
    all: all.count ?? 0,
    open: open.count ?? 0,
    overdue: overdue.count ?? 0,
    soon: soonC.count ?? 0,
    noDate: noDate.count ?? 0,
  };
}

export interface CasesPageResult {
  rows: MatterRow[];
  total: number;
}

// Build a CSV of the given matters (WO-43-W2 bulk export). Pure — the client wraps it in a Blob
// download. RFC-4180 quoting: every field quoted, embedded `"` doubled, CRLF row terminators.
const CSV_HEADERS = ["Title", "CNR", "Court", "Case type", "Stage", "Status", "Next hearing"] as const;
export function toCasesCsv(rows: MatterRow[]): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [CSV_HEADERS.map(esc).join(",")];
  for (const r of rows) {
    lines.push(
      [r.title, r.cnr, r.court, r.case_type, r.stage, r.status, r.next_hearing_override ?? r.next_hearing_date]
        .map(esc)
        .join(","),
    );
  }
  return lines.join("\r\n");
}

export async function fetchCasesPage(
  supabase: SupabaseClient<Database>,
  filters: CasesFilters,
  page: number,
  per: number,
): Promise<CasesPageResult> {
  const { from, to } = rangeFor(page, per);
  const { data, count, error } = await buildCasesQuery(supabase, filters).range(from, to);
  if (error) throw new Error(`fetchCasesPage: ${error.message}`);
  return { rows: (data ?? []) as unknown as MatterRow[], total: count ?? 0 };
}
