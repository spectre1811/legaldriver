// Keyset (cursor) pagination — the scale primitive WO-39 / ship-grade §2 instantiates.
//
// Why keyset, not offset: OFFSET re-scans and discards every skipped row (cost grows
// with page depth) and drifts when rows are inserted/deleted between pages. Keyset
// SEEKS straight to the cursor through the (sort_col, id) index, so page 1 and page
// 1000 cost the same, and it's stable under concurrent writes.
//
// The contract every list uses:
//   ORDER BY (col, id) <dir>
//   WHERE   (col, id)  <after the cursor in that order>   -- only when paging
//   LIMIT   pageSize + 1                                   -- the +1 reveals "is there more?"
//                                                             without a second COUNT query.
//
// Requirement: the sort column is NOT NULL (created_at, list_date, …) and is paired
// with a NOT NULL, unique tiebreaker (default `id`) so the total order is deterministic.
// Keyset over a NULLABLE column needs a different technique — a caller whose natural
// sort key is nullable (e.g. next_hearing_date) should sort on a NOT NULL surrogate
// like created_at, or fall back to a bounded, indexed offset page. Don't paginate a
// nullable column with this helper and hope; it will skip or repeat rows at the nulls.

export type CursorScalar = string | number;

export interface DecodedCursor {
  value: CursorScalar;
  id: CursorScalar;
}

export interface PaginateOptions {
  /** NOT NULL column the list is ordered by (e.g. "created_at", "list_date"). */
  column: string;
  /** Unique NOT NULL tiebreaker; defaults to "id". */
  idColumn?: string;
  /** false (default) = newest/highest first (DESC); true = ASC. */
  ascending?: boolean;
  /** Rows per page (default 25). The query fetches limit+1 to detect a next page. */
  limit?: number;
  /** Opaque cursor from a previous page's `nextCursor`; null/undefined = first page. */
  cursor?: string | null;
}

export interface Page<T> {
  rows: T[];
  /** Pass back as `cursor` to fetch the next page; null when this is the last page. */
  nextCursor: string | null;
}

export const DEFAULT_PAGE_SIZE = 25;

// A minimal structural view of the Supabase query builder — just the fluent methods
// this helper calls, in the order it calls them (`.or()` before ordering). Modelling
// only what we use keeps the helper decoupled from supabase-js's internal builder
// generics, which differ across 2.x releases.
interface OrderedQuery<Row> extends PromiseLike<{ data: Row[] | null; error: { message: string } | null }> {
  order(column: string, options: { ascending: boolean }): OrderedQuery<Row>;
  limit(count: number): OrderedQuery<Row>;
}
export interface PaginableQuery<Row> extends OrderedQuery<Row> {
  or(filters: string): PaginableQuery<Row>;
}

// --- Cursor codec (opaque to callers; base64url so it's URL/query-string safe) ------

export function encodeCursor(value: CursorScalar, id: CursorScalar): string {
  return Buffer.from(JSON.stringify({ v: value, id })).toString("base64url");
}

export function decodeCursor(cursor: string | null | undefined): DecodedCursor | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const { v, id } = parsed as { v?: unknown; id?: unknown };
    if (!isScalar(v) || !isScalar(id)) return null;
    return { value: v, id };
  } catch {
    return null; // a malformed/tampered cursor degrades to "first page", never throws.
  }
}

function isScalar(x: unknown): x is CursorScalar {
  return typeof x === "string" || typeof x === "number";
}

// Format a value for a PostgREST filter. Strings are double-quoted (and inner quotes
// escaped) so reserved characters in timestamps/UUIDs (`:` `.` `+` `,`) can't break the
// filter grammar; numbers pass through bare.
function fmt(x: CursorScalar): string {
  return typeof x === "number" ? String(x) : `"${x.replace(/"/g, '\\"')}"`;
}

/**
 * The PostgREST `.or()` argument that selects rows strictly AFTER `cursor` in the
 * (column, idColumn) order. Descending: (col < v) OR (col = v AND id < id). Ascending
 * flips both comparators. The compound form is what makes ties on `column` stable.
 */
export function keysetFilter(
  column: string,
  idColumn: string,
  ascending: boolean,
  cursor: DecodedCursor,
): string {
  const cmp = ascending ? "gt" : "lt";
  const v = fmt(cursor.value);
  const id = fmt(cursor.id);
  return `${column}.${cmp}.${v},and(${column}.eq.${v},${idColumn}.${cmp}.${id})`;
}

/**
 * Given the rows returned by a `limit+1` query, drop the probe row and compute the
 * next cursor from the last kept row. Pure so it's unit-testable without a DB.
 */
export function finalizePage<T extends Record<string, unknown>>(
  fetched: T[],
  limit: number,
  column: string,
  idColumn: string,
): Page<T> {
  const hasMore = fetched.length > limit;
  const rows = hasMore ? fetched.slice(0, limit) : fetched;
  const last = rows[rows.length - 1];
  let nextCursor: string | null = null;
  if (hasMore && last) {
    const v = last[column];
    const id = last[idColumn];
    if (isScalar(v) && isScalar(id)) nextCursor = encodeCursor(v, id);
  }
  return { rows, nextCursor };
}

/**
 * Apply keyset pagination to an already-filtered Supabase list query and execute it.
 * The caller's `.select()` MUST include `column` and `idColumn` (they're needed to
 * mint the next cursor). Tenant scoping / other filters are applied by the caller
 * before handing the query in; RLS still guards every read.
 */
// The public generic is intentionally unconstrained so callers can pass a plain
// row interface (which has no index signature). Indexing for the cursor happens in
// finalizePage against a `Record<string, unknown>` view — the row shape is unchanged.
export async function paginate<T>(
  query: PaginableQuery<T>,
  opts: PaginateOptions,
): Promise<Page<T>> {
  const idColumn = opts.idColumn ?? "id";
  const ascending = opts.ascending ?? false;
  const limit = Math.max(1, opts.limit ?? DEFAULT_PAGE_SIZE);
  const decoded = decodeCursor(opts.cursor);

  let q: OrderedQuery<T> = decoded
    ? query.or(keysetFilter(opts.column, idColumn, ascending, decoded))
    : query;
  q = q.order(opts.column, { ascending }).order(idColumn, { ascending }).limit(limit + 1);

  const { data, error } = await q;
  if (error) throw new Error(`paginate(${opts.column}): ${error.message}`);
  const page = finalizePage((data ?? []) as Record<string, unknown>[], limit, opts.column, idColumn);
  return { rows: page.rows as unknown as T[], nextCursor: page.nextCursor };
}

// --- Offset pagination (for the surfaces keyset can't serve cleanly) ------------------
//
// Keyset needs a NOT NULL sort key. A list whose natural sort is a NULLABLE column
// (cases by `next_hearing_date` urgency, ip by `renewal_date`) — or one that lets the
// user re-sort by arbitrary columns — can't keyset without a per-sort null-aware WHERE.
// For those *bounded per-tenant* lists, OFFSET is the right tool (ship-grade §2 permits
// it for bounded sets): it works with any ORDER BY (incl. nullable + user-chosen) and
// preserves the existing filter/sort logic verbatim. Tradeoff: it re-scans skipped rows
// (fine at these sizes) and can drift if rows are inserted/deleted mid-browse (rare for
// a lawyer's own caseload). It returns the SAME `Page<T>` contract, so `<PaginatedList>`
// drives it unchanged — the cursor just encodes an offset instead of a keyset position.

export interface OffsetQuery<Row> extends PromiseLike<{ data: Row[] | null; error: { message: string } | null }> {
  range(from: number, to: number): OffsetQuery<Row>;
}

export function encodeOffset(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset })).toString("base64url");
}

export function decodeOffset(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { o?: unknown };
    return typeof parsed.o === "number" && Number.isFinite(parsed.o) && parsed.o >= 0 ? parsed.o : 0;
  } catch {
    return 0; // malformed → first page, never throws.
  }
}

/**
 * Apply offset pagination to an already-filtered+ordered Supabase query and execute it.
 * Fetches `limit+1` rows (via an inclusive `.range`) to detect a next page without a COUNT.
 */
export async function offsetPage<T>(
  query: OffsetQuery<T>,
  opts: { limit?: number; cursor?: string | null },
): Promise<Page<T>> {
  const limit = Math.max(1, opts.limit ?? DEFAULT_PAGE_SIZE);
  const offset = decodeOffset(opts.cursor);
  const { data, error } = await query.range(offset, offset + limit); // inclusive → limit+1 rows
  if (error) throw new Error(`offsetPage: ${error.message}`);
  const rows = (data ?? []) as T[];
  const hasMore = rows.length > limit;
  return {
    rows: hasMore ? rows.slice(0, limit) : rows,
    nextCursor: hasMore ? encodeOffset(offset + limit) : null,
  };
}

// --- Numbered-page pagination (the classic table control: pages + rows-per-page) -----
//
// For data tables an advocate scans (cases, clients, …), "Load more" is the wrong UX —
// they expect numbered pages, a rows-per-page choice, and "showing X–Y of N". That's
// URL-driven (`?page=N&per=P`): bookmarkable, server-rendered, and composes with the
// existing filter searchParams. These pure helpers do the arithmetic; `<Pagination>`
// renders it; the page fetches its slice with `.range(from,to)` + a `{count:'exact'}`.

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_PER_PAGE = 25;

/** Parse a 1-based page from a query string; anything invalid → 1. */
export function parsePage(v: string | undefined | null): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** Clamp a per-page choice to the allowed set; anything else → the default. */
export function clampPerPage(v: string | number | undefined | null, options: readonly number[] = PAGE_SIZE_OPTIONS): number {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && options.includes(n) ? n : DEFAULT_PER_PAGE;
}

/** Inclusive Supabase `.range(from, to)` bounds for a 1-based page. */
export function rangeFor(page: number, per: number): { from: number; to: number } {
  const from = (Math.max(1, page) - 1) * per;
  return { from, to: from + per - 1 };
}

export function pageCount(total: number, per: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, per)));
}

/**
 * The compact page-number window for the control, e.g. `[1, "…", 4, 5, 6, "…", 20]`.
 * Always shows the first + last page and `span` neighbours around the current one;
 * collapses the rest into "…". No gap token when the pages are already adjacent.
 */
export function pageWindow(current: number, total: number, span = 1): (number | "…")[] {
  const cur = Math.min(Math.max(1, current), total);
  const pages = new Set<number>([1, total]);
  for (let p = cur - span; p <= cur + span; p++) if (p >= 1 && p <= total) pages.add(p);
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}
