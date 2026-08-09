import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { rangeFor } from "@/lib/paginate";

// Cases list query (WO-39). Numbered-page pagination: the page fetches `.range(from,to)`
// for the requested page WITH an exact count, so the control can show real page numbers +
// "showing X–Y of N". Offset/range (not keyset) because the default sort is the NULLABLE
// `next_hearing_date` (urgency order) and the user can re-sort — keyset can't serve that.

export interface CasesFilters {
  q?: string;
  tier?: string; // WO-54 W2: court-tier segmentation (HC/DISTRICT/…) — indexed matter.tier column
  // WO-59: facet filters are multi-select. Repeated URL params (`?court=A&court=B`) — NOT a
  // comma-joined string — because facet values legitimately contain commas (act names like
  // "Indian Penal Code, 1860"). Next.js hands a repeated param through as `string[]`.
  court?: string | string[];
  case_type?: string | string[];
  stage?: string | string[];
  status?: string; // semantic grouping token from the tabs (open/disposed/all)
  statuses?: string | string[]; // real distinct status values from the console multi-select
  advocate?: string | string[];
  act?: string | string[];
  judge?: string | string[]; // WO-54 W2b: judge/coram facet (judge_names array column)
  next?: string;
  sort?: string;
}

// Normalize a repeated/absent/single URL param into a clean value array (trimmed, non-empty).
function asArray(v: string | string[] | undefined): string[] {
  if (v == null) return [];
  return (Array.isArray(v) ? v : [v]).map((s) => s.trim()).filter(Boolean);
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

// WO-331 Daybreak reskin · "stale records" — a matter whose court record hasn't been refreshed
// recently, distinct from an overdue HEARING (that's urgency; this is sync freshness). No founder
// SLO exists yet for this bucket (FG-8 open) — 30 days is our own defensible default, reused by
// both the count below and the `next=stale` filter so the attention chip and the filtered list can
// never disagree. Real column (`last_synced_at`), no fabrication; never-synced counts as stale too.
export const STALE_SYNC_DAYS = 30;

function staleCutoffIso(now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - STALE_SYNC_DAYS);
  return d.toISOString();
}

// Status semantics (WO-59). eCourts stores `matter.status` as a free-text string ("Pending" /
// "Disposed" / NULL / …), never a clean enum — so the old exact `.eq("status","open")` matched
// almost nothing while the tab still showed a count (the founder's "Open shows cases that don't
// exist"). The UI now exposes two SEMANTIC groupings + the raw values, mapped to substring rules
// that are IDENTICAL to the WO-56 portfolio dashboard (so the tab count and the filtered list can
// never disagree across the app):
//   "open"     → status IS NULL, or not disposed/closed
//   "disposed" → disposed/closed  (ilike on NULL is NULL→excluded, so no explicit not-null needed)
// Any other value is a real distinct status (the Wave-2 multi-select of actual values), matched
// exactly via `.in` (comma-separated → multiple values).
export const OPEN_STATUS_OR = "status.is.null,and(status.not.ilike.*dispos*,status.not.ilike.*closed*)";
export const DISPOSED_STATUS_OR = "status.ilike.*dispos*,status.ilike.*closed*";

export type StatusPlan =
  | { kind: "or"; filter: string }
  | { kind: "in"; values: string[] }
  | null;

// Pure: decide how a `status` param becomes a PostgREST filter (or nothing). Exported for the test.
export function planStatusFilter(status: string | undefined): StatusPlan {
  if (!status) return null;
  if (status === "open") return { kind: "or", filter: OPEN_STATUS_OR };
  if (status === "disposed") return { kind: "or", filter: DISPOSED_STATUS_OR };
  const values = status.split(",").map((s) => s.trim()).filter(Boolean);
  return values.length ? { kind: "in", values } : null;
}

function applyStatusFilter<T>(query: T, status: string | undefined): T {
  const plan = planStatusFilter(status);
  if (!plan) return query;
  const q = query as { or: (f: string) => T; in: (c: string, v: string[]) => T };
  return plan.kind === "or" ? q.or(plan.filter) : q.in("status", plan.values);
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
  if (f.tier) query = query.eq("tier", f.tier); // WO-54 W2: tier tab scope (uses matter_tier_idx)
  // Scalar columns: `.in` matches any of the picked values (OR within a facet). Array columns
  // (advocate_names / act_names): `.overlaps` matches a row whose array shares ≥1 picked value.
  const courts = asArray(f.court);
  if (courts.length) query = query.in("court", courts);
  const caseTypes = asArray(f.case_type);
  if (caseTypes.length) query = query.in("case_type", caseTypes);
  const stages = asArray(f.stage);
  if (stages.length) query = query.in("stage", stages);
  if (f.status) query = applyStatusFilter(query, f.status);
  const statuses = asArray(f.statuses);
  if (statuses.length) query = query.in("status", statuses);
  const advocates = asArray(f.advocate);
  if (advocates.length) query = query.overlaps("advocate_names", advocates);
  const acts = asArray(f.act);
  if (acts.length) query = query.overlaps("act_names", acts);
  const judges = asArray(f.judge); // WO-54 W2b: judge_names is an array column → overlaps (any-of)
  if (judges.length) query = query.overlaps("judge_names", judges);

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
  } else if (f.next === "stale") {
    // Mirrors the `stale` count in fetchViewCounts below — same cutoff, same "never synced counts
    // as stale" rule, so the attention chip's number always matches what clicking it shows.
    query = query.or(`last_synced_at.is.null,last_synced_at.lt.${staleCutoffIso()}`);
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
  disposed: number;
  overdue: number;
  soon: number; // next hearing within 7 days
  noDate: number;
  stale: number; // WO-331: not synced in STALE_SYNC_DAYS+ (or never) — sync freshness, not urgency
}

export async function fetchViewCounts(supabase: SupabaseClient<Database>): Promise<ViewCounts> {
  const today = isoDay(new Date());
  const soon = new Date();
  soon.setDate(soon.getDate() + 7);
  const head = () => supabase.from("matter").select("id", { count: "exact", head: true });
  // Status counts go through the SAME `applyStatusFilter` as the list query, so a tab count always
  // matches the rows the tab shows (WO-59). Urgency counts (overdue/soon/no-date) feed the
  // Attention bar (WO-59 W3), not the tabs. `stale` is the same additive HEAD-count pattern, keyed
  // off the real `last_synced_at` column (WO-331) — never a fabricated figure.
  const [all, open, disposed, overdue, soonC, noDate, stale] = await Promise.all([
    head(),
    applyStatusFilter(head(), "open"),
    applyStatusFilter(head(), "disposed"),
    head().lt("next_hearing_date", today),
    head().gte("next_hearing_date", today).lte("next_hearing_date", isoDay(soon)),
    head().is("next_hearing_date", null),
    head().or(`last_synced_at.is.null,last_synced_at.lt.${staleCutoffIso()}`),
  ]);
  return {
    all: all.count ?? 0,
    open: open.count ?? 0,
    disposed: disposed.count ?? 0,
    overdue: overdue.count ?? 0,
    soon: soonC.count ?? 0,
    noDate: noDate.count ?? 0,
    stale: stale.count ?? 0,
  };
}

// WO-54 W2 · Live counts for the court-tier tab strip. HEAD counts (no rows), tenant-scoped by RLS
// and index-backed (matter_tier_idx) — bounded, not a scan. Independent of the active filters (tier
// is a navigation axis, like the saved-view tabs). `all` counts every matter; the per-tier counts
// only the normalized `matter.tier` values (a null-tier / manual case shows under All, never a tier).
export interface TierCounts {
  all: number;
  HC: number;
  DISTRICT: number;
  TRIBUNAL: number;
  SC: number;
}

export async function fetchTierCounts(supabase: SupabaseClient<Database>): Promise<TierCounts> {
  const head = () => supabase.from("matter").select("id", { count: "exact", head: true });
  const [all, hc, dist, trib, sc] = await Promise.all([
    head(),
    head().eq("tier", "HC"),
    head().eq("tier", "DISTRICT"),
    head().eq("tier", "TRIBUNAL"),
    head().eq("tier", "SC"),
  ]);
  return {
    all: all.count ?? 0,
    HC: hc.count ?? 0,
    DISTRICT: dist.count ?? 0,
    TRIBUNAL: trib.count ?? 0,
    SC: sc.count ?? 0,
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
