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
  custom: Record<string, unknown>;
}

export interface ClientRow extends RawClient {
  caseCount: number;
  /** True unpaid balance in minor units: SUM(invoice.total_minor) over status='sent'
   *  (the only unpaid-issued state the schema has — draft=unbilled, paid=settled,
   *  cancelled=void; no partial-payment tracking exists). */
  outstandingMinor: number;
  practiceArea: string | null;
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
    .select("id, name, type, emails, phones, custom", { count: "exact" })
    .order("name", { ascending: true })
    .range(from, to);
  if (error) throw new Error(`fetchClientsPage: ${error.message}`);
  const rows = (data ?? []) as RawClient[];

  const ids = rows.map((r) => r.id);
  const counts = new Map<string, number>();
  const outstanding = new Map<string, number>();
  const areaNames = new Map<string, string>();
  if (ids.length) {
    // All per-page enrichment is IN over just this page's client ids (cost scales with
    // page size, not the corpus) and stays RLS/tenant-scoped — no admin client.
    const [{ data: matters }, { data: invoices }] = await Promise.all([
      supabase.from("matter").select("client_id").in("client_id", ids),
      // Outstanding = unpaid-issued invoices only (status='sent'). draft/paid/cancelled excluded.
      supabase.from("invoice").select("client_id, total_minor").eq("status", "sent").in("client_id", ids),
    ]);
    for (const m of matters ?? []) if (m.client_id) counts.set(m.client_id, (counts.get(m.client_id) ?? 0) + 1);
    for (const inv of invoices ?? []) if (inv.client_id) outstanding.set(inv.client_id, (outstanding.get(inv.client_id) ?? 0) + Number(inv.total_minor ?? 0));

    // Resolve practice-area names for the ids buried in each client's custom jsonb.
    const areaIds = [...new Set(rows.map((r) => (r.custom as { practice_area_id?: string })?.practice_area_id).filter((v): v is string => !!v))];
    if (areaIds.length) {
      const { data: areas } = await supabase.from("practice_area").select("id, name").in("id", areaIds);
      for (const a of areas ?? []) areaNames.set(a.id, a.name);
    }
  }

  return {
    rows: rows.map((r) => {
      const areaId = (r.custom as { practice_area_id?: string })?.practice_area_id;
      return {
        ...r,
        caseCount: counts.get(r.id) ?? 0,
        outstandingMinor: outstanding.get(r.id) ?? 0,
        practiceArea: areaId ? areaNames.get(areaId) ?? null : null,
      };
    }),
    total: count ?? 0,
  };
}
