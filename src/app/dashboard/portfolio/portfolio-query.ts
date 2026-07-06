import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";

// WO-56 · portfolio data layer — bounded + indexed, replacing the two fetch-all scans
// the risk dashboard used to run (`matter … .limit(1000)` + `document … .limit(3000)`).
//
// A firm's OPEN caseload is a bounded per-tenant set (ship-grade §2 permits an offset/
// bounded scan for these). We (a) push the open-status filter into SQL so disposed/
// closed rows never come back, (b) cap the scan and flag it honestly on overflow rather
// than silently truncating, and (c) fetch "latest document per matter" only for the
// handful of at-risk candidates instead of every document in the tenant.
//
// The proper long-term fix (a `COALESCE(override, hearing)` generated column + index →
// a true count-based dashboard with no scan at all) needs a migration and is filed in
// BACKLOG §D; until then this is correct (the override coalesce is applied in JS over
// the open set) and bounded.

export const OPEN_SCAN_CAP = 500;

export interface PortfolioMatter {
  id: string;
  title: string;
  cnr: string | null;
  status: string | null;
  court: string | null;
  next_hearing_date: string | null;
  next_hearing_override: string | null;
  last_synced_at: string | null;
}

export interface PortfolioData {
  /** The tenant's open matters (capped at OPEN_SCAN_CAP), soonest-hearing first. */
  open: PortfolioMatter[];
  /** matter_id → its latest document's created_at, for at-risk candidates only. */
  latestDocByMatter: Map<string, string>;
  /** True when the open caseload exceeded the cap (surface an honest banner). */
  capped: boolean;
}

const effectiveDate = (m: PortfolioMatter) => m.next_hearing_override ?? m.next_hearing_date;

export async function fetchPortfolio(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  today: string,
  plus7: string,
): Promise<PortfolioData> {
  // Open = NOT disposed/closed. Status is free text, so match case-insensitively and
  // treat NULL as open (a matter with no status set is still active) — mirrors the old
  // `!/dispos|closed/i.test(status ?? "")` exactly. Ordered soonest-hearing first so the
  // cap keeps the most decision-relevant rows; nulls (undated) sort last.
  const { data, error } = await supabase
    .from("matter")
    .select("id, title, cnr, status, court, next_hearing_date, next_hearing_override, last_synced_at")
    .eq("tenant_id", tenantId)
    .or("status.is.null,and(status.not.ilike.*dispos*,status.not.ilike.*closed*)")
    .order("next_hearing_date", { ascending: true, nullsFirst: false })
    .limit(OPEN_SCAN_CAP + 1); // +1 probe → did we exceed the cap?
  if (error) throw new Error(`fetchPortfolio matters: ${error.message}`);

  const rows = (data ?? []) as PortfolioMatter[];
  const capped = rows.length > OPEN_SCAN_CAP;
  const open = capped ? rows.slice(0, OPEN_SCAN_CAP) : rows;

  // At-risk candidates = open matters whose effective hearing is within 7 days. Only
  // these need a "latest document" lookup (at-risk = imminent hearing + no recent doc),
  // so scope the document query to them instead of scanning every document.
  const candidateIds = open
    .filter((m) => {
      const e = effectiveDate(m);
      return e && e >= today && e <= plus7;
    })
    .map((m) => m.id);

  const latestDocByMatter = new Map<string, string>();
  if (candidateIds.length) {
    const { data: docs, error: docErr } = await supabase
      .from("document")
      .select("matter_id, created_at")
      .eq("tenant_id", tenantId)
      .in("matter_id", candidateIds)
      .order("created_at", { ascending: false });
    if (docErr) throw new Error(`fetchPortfolio docs: ${docErr.message}`);
    for (const d of docs ?? []) {
      if (d.matter_id && !latestDocByMatter.has(d.matter_id)) latestDocByMatter.set(d.matter_id, d.created_at);
    }
  }

  return { open, latestDocByMatter, capped };
}
