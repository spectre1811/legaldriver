import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { rangeFor } from "@/lib/paginate";

// Invoices fee-book (WO-201 W2). Numbered-page pagination by issue_date desc + a small
// set of honest aggregates for the label-top stat cards. Every value is data-bound to
// the `invoice` table — NO fabricated money/tax/status. There is no `payment` table in
// the schema (draft=unbilled, sent=issued-unpaid, paid=settled, cancelled=void; no
// partial-payment tracking), so "outstanding" = SUM(total_minor) over status='sent'.

export type GstKind = "cgst_sgst" | "igst" | "none";

export interface InvoiceRow {
  id: string;
  number: string | null;
  status: string;
  issue_date: string;
  due_date: string | null;
  total_minor: number;
  clientName: string | null;
  /** Which GST split this invoice actually carries, derived from the populated *_minor
   *  columns — intra-state (CGST+SGST) vs inter-state (IGST) vs no GST. Honest per-row;
   *  never guessed from place-of-supply. */
  gstKind: GstKind;
}

export interface InvoiceStats {
  /** SUM(total_minor) WHERE status='sent' — the only unpaid-issued state. */
  outstandingMinor: number;
  /** Count of draft (unbilled/assembling) invoices. */
  draftCount: number;
  /** Count of all invoices (any status). */
  totalCount: number;
  /** SUM(total_minor) WHERE status='paid' AND fy=<current fy> — honest, fy-scoped. */
  paidThisFyMinor: number;
  /** The FY the paid figure is scoped to (India Apr–Mar), e.g. "2026-27". */
  fy: string;
}

export interface InvoicesPageResult {
  rows: InvoiceRow[];
  total: number;
  stats: InvoiceStats;
}

function gstKindOf(r: { cgst_minor: number; sgst_minor: number; igst_minor: number }): GstKind {
  if ((r.igst_minor ?? 0) > 0) return "igst";
  if ((r.cgst_minor ?? 0) > 0 || (r.sgst_minor ?? 0) > 0) return "cgst_sgst";
  return "none";
}

/** Indian financial year (Apr 1 – Mar 31) for a date, formatted "YYYY-YY" to match
 *  the invoice.fy column (e.g. 2026-04-01 → "2026-27"). Pure — no DB. */
export function financialYear(d: Date): string {
  const y = d.getUTCFullYear();
  const start = d.getUTCMonth() >= 3 ? y : y - 1; // Jan–Mar belong to the prior FY
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export async function fetchInvoicesPage(
  supabase: SupabaseClient<Database>,
  page: number,
  per: number,
): Promise<InvoicesPageResult> {
  const { from, to } = rangeFor(page, per);
  const fy = financialYear(new Date());

  // Page slice (RLS-scoped) + the aggregate inputs. Aggregates read only the columns they
  // sum/count; both stay tenant-scoped via RLS. `sent`/`paid` sets are small (issued
  // invoices), so pulling their minor totals client-side is cheap and avoids an RPC.
  const [{ data, count, error }, sentRes, paidRes, draftRes, totalRes] = await Promise.all([
    supabase
      .from("invoice")
      .select(
        "id, number, status, issue_date, due_date, total_minor, cgst_minor, sgst_minor, igst_minor, client:client_id(name)",
        { count: "exact" },
      )
      .order("issue_date", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to),
    supabase.from("invoice").select("total_minor").eq("status", "sent"),
    supabase.from("invoice").select("total_minor").eq("status", "paid").eq("fy", fy),
    supabase.from("invoice").select("id", { count: "exact", head: true }).eq("status", "draft"),
    supabase.from("invoice").select("id", { count: "exact", head: true }),
  ]);
  if (error) throw new Error(`fetchInvoicesPage: ${error.message}`);

  const rows: InvoiceRow[] = (data ?? []).map((r) => {
    const client = r.client as { name?: string } | null;
    return {
      id: r.id,
      number: r.number,
      status: r.status,
      issue_date: r.issue_date,
      due_date: r.due_date,
      total_minor: Number(r.total_minor ?? 0),
      clientName: client?.name ?? null,
      gstKind: gstKindOf(r),
    };
  });

  const sumMinor = (res: { data: { total_minor: number }[] | null }) =>
    (res.data ?? []).reduce((a, x) => a + Number(x.total_minor ?? 0), 0);

  return {
    rows,
    total: count ?? 0,
    stats: {
      outstandingMinor: sumMinor(sentRes),
      paidThisFyMinor: sumMinor(paidRes),
      draftCount: draftRes.count ?? 0,
      totalCount: totalRes.count ?? 0,
      fy,
    },
  };
}
