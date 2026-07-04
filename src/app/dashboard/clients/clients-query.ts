import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { paginate, type Page, type PaginableQuery } from "@/lib/paginate";

// Clients list, keyset-paginated by name (WO-39). `client.name` is NOT NULL, so it's a
// safe sort key paired with the id tiebreaker. Case counts are computed per-PAGE (an
// `IN` over just this page's client ids) instead of the old full-table `matter` scan —
// so cost scales with page size, not the whole corpus (ship-grade §3). A DB aggregate
// / view would be even better; that's the founder-gated W3 index+facet pass.

export const CLIENTS_PAGE_SIZE = 30;

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

export async function fetchClientsPage(
  supabase: SupabaseClient<Database>,
  cursor?: string | null,
): Promise<Page<ClientRow>> {
  const base = supabase
    .from("client")
    .select("id, name, type, emails, phones") as unknown as PaginableQuery<RawClient>;

  const page = await paginate<RawClient>(base, {
    column: "name",
    ascending: true,
    limit: CLIENTS_PAGE_SIZE,
    cursor,
  });

  const ids = page.rows.map((r) => r.id);
  const counts = new Map<string, number>();
  if (ids.length) {
    const { data: matters } = await supabase.from("matter").select("client_id").in("client_id", ids);
    for (const m of matters ?? []) if (m.client_id) counts.set(m.client_id, (counts.get(m.client_id) ?? 0) + 1);
  }

  return {
    rows: page.rows.map((r) => ({ ...r, caseCount: counts.get(r.id) ?? 0 })),
    nextCursor: page.nextCursor,
  };
}
