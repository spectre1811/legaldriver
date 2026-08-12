// WO-409 · pure sort/date-range helpers for the Documents toolbar's "Sort by" + "Date from"/"Date
// to" filters — kept separate from page.tsx (and unit-tested, tests/wo409_documents_filters.ts)
// because date-boundary math is easy to get subtly wrong (off-by-one on the "to" day, silently
// dropping an unparsable value into a broken query, etc).

export type DocSortBy = "date_desc" | "date_asc" | "name_asc";

export const DOC_SORT_OPTIONS: readonly DocSortBy[] = ["date_desc", "date_asc", "name_asc"];
const VALID_SORTS = new Set<DocSortBy>(DOC_SORT_OPTIONS);

/** Any missing/unrecognised value falls back to the default (newest first) — never throws. */
export function parseSortBy(v: string | undefined | null): DocSortBy {
  return v && VALID_SORTS.has(v as DocSortBy) ? (v as DocSortBy) : "date_desc";
}

/** The `.order()` column + direction a sort choice maps to. */
export function sortColumn(sort: DocSortBy): { column: string; ascending: boolean } {
  if (sort === "date_asc") return { column: "created_at", ascending: true };
  if (sort === "name_asc") return { column: "filename", ascending: true };
  return { column: "created_at", ascending: false };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD", shape-valid AND a real calendar date (rejects e.g. month 13 / day 40). */
function isRealDate(v: string): boolean {
  return DATE_RE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00.000Z`));
}

/**
 * Convert native `<input type="date">` values ("YYYY-MM-DD") into UTC day-boundary ISO
 * timestamps for a `created_at` range filter — start-of-day for "from", end-of-day (inclusive)
 * for "to". A malformed/absent bound degrades to "no filter" for that side, never a broken query.
 */
export function dateBounds(
  from: string | undefined | null,
  to: string | undefined | null,
): { fromIso: string | null; toIso: string | null } {
  return {
    fromIso: from && isRealDate(from) ? `${from}T00:00:00.000Z` : null,
    toIso: to && isRealDate(to) ? `${to}T23:59:59.999Z` : null,
  };
}
