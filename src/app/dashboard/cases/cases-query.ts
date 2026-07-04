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
  client: { name?: string } | null;
}

const SELECT =
  "id, cnr, title, court, case_type, stage, status, next_hearing_date, next_hearing_override, last_synced_at, source, party_names, client:client_id(name)";

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

  if (f.sort === "created_at") query = query.order("created_at", { ascending: false });
  else if (f.sort === "title") query = query.order("title", { ascending: true });
  else query = query.order("next_hearing_date", { ascending: true, nullsFirst: false });

  return query;
}

export interface CasesPageResult {
  rows: MatterRow[];
  total: number;
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
