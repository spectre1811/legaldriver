"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { Page } from "@/lib/paginate";

// The reusable list primitive WO-39 / ship-grade §2 asks for: ONE component every
// growing list uses, so we never again ship 22 inconsistent (or absent) pagers.
//
// It owns the four states a real list needs — rows, loading-more, empty, end — plus
// keyset accumulation. The consumer owns only the row markup, via the `children`
// render-prop, so the same primitive serves a flat list (notices) and a grouped one
// (regroup the accumulated rows in the child). "Load more" calls a server action that
// returns the next keyset `Page`; RLS scopes that read to the caller's tenant.

export interface PaginatedListProps<T> {
  initialRows: T[];
  initialCursor: string | null;
  /** Server action: given the current cursor, returns the next keyset page. */
  loadMore: (cursor: string) => Promise<Page<T>>;
  /** Render the accumulated rows however the surface needs (flat or grouped). */
  children: (rows: T[]) => React.ReactNode;
  /** Shown when there are zero rows at all. */
  empty?: React.ReactNode;
  /** Rows-per-load, only used to size the loading skeleton. Defaults to 6. */
  skeletonRows?: number;
}

export function PaginatedList<T>({
  initialRows,
  initialCursor,
  loadMore,
  children,
  empty,
  skeletonRows = 4,
}: PaginatedListProps<T>) {
  const t = useTranslations("pagination");
  const [rows, setRows] = useState<T[]>(initialRows);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  function onLoadMore() {
    if (!cursor || pending) return;
    setError(false);
    startTransition(async () => {
      try {
        const page = await loadMore(cursor);
        setRows((prev) => [...prev, ...page.rows]);
        setCursor(page.nextCursor);
      } catch {
        setError(true); // surfaced with a retry; never a silent stall.
      }
    });
  }

  if (rows.length === 0) return <>{empty ?? null}</>;

  // `data-testid` + `data-row-count` are stable hooks for the QA tester (WO-36 e2e): a
  // spec reads the count, clicks load-more, and asserts it grew — surface-agnostic (works
  // for tables and card lists alike) and i18n-independent. `data-has-more` lets a spec
  // decide whether to expect a load-more without depending on demo-data volume.
  return (
    <div className="space-y-4" data-testid="paginated-list" data-row-count={rows.length} data-has-more={cursor ? "true" : "false"}>
      {children(rows)}

      {pending && <ListSkeleton rows={skeletonRows} />}

      {cursor && !pending && (
        <div className="flex flex-col items-center gap-2 pt-1">
          <button type="button" onClick={onLoadMore} className="btn-secondary" data-testid="paginated-load-more">
            {t("loadMore")}
          </button>
          {error && (
            <p className="text-xs text-amber-600" role="alert">{t("error")}</p>
          )}
        </div>
      )}

      {!cursor && !pending && rows.length > 0 && (
        <p className="pt-1 text-center text-xs text-ink-faint" data-testid="paginated-end">{t("end", { n: rows.length })}</p>
      )}
    </div>
  );
}

// Neutral list-shaped skeleton — reused by `loading.tsx` routes and the load-more
// pending state so a slow query animates instead of blanking the surface. Uses
// palette-agnostic tints so it sits cleanly on either token set.
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-line px-5 py-4">
          <div className="h-4 w-4 shrink-0 animate-pulse rounded bg-black/5" />
          <div className="h-3.5 flex-1 animate-pulse rounded bg-black/5" style={{ maxWidth: `${70 - (i % 3) * 12}%` }} />
          <div className="h-3.5 w-16 shrink-0 animate-pulse rounded bg-black/5" />
        </div>
      ))}
    </div>
  );
}
