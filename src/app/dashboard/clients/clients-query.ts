import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { rangeFor } from "@/lib/paginate";

// Clients list (WO-39), numbered-page pagination by name. Case counts are computed
// per-PAGE (an `IN` over just this page's client ids) instead of the old full-table
// `matter` scan — cost scales with page size, not the corpus (ship-grade §3). A DB
// aggregate/view is the founder-gated follow-up.

interface RawClient {
  id: string;
  name: string;
  type: string;
  emails: string[];
  phones: string[];
}

export interface ClientRow extends RawClient {
  caseCount: number;
}

export interface ClientsPageResult {
  rows: ClientRow[];
  total: number;
}

export async function fetchClientsPage(
  supabase: SupabaseClient<Database>,
  page: number,
  per: number,
): Promise<ClientsPageResult> {
  const { from, to } = rangeFor(page, per);
  const { data, count, error } = await supabase
    .from("client")
    .select("id, name, type, emails, phones", { count: "exact" })
    .order("name", { ascending: true })
    .range(from, to);
  if (error) throw new Error(`fetchClientsPage: ${error.message}`);
  const rows = (data ?? []) as RawClient[];

  const ids = rows.map((r) => r.id);
  const counts = new Map<string, number>();
  if (ids.length) {
    const { data: matters } = await supabase.from("matter").select("client_id").in("client_id", ids);
    for (const m of matters ?? []) if (m.client_id) counts.set(m.client_id, (counts.get(m.client_id) ?? 0) + 1);
  }

  return {
    rows: rows.map((r) => ({ ...r, caseCount: counts.get(r.id) ?? 0 })),
    total: count ?? 0,
  };
}
