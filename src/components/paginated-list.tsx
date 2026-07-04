// List-shaped loading skeleton, used by the heavy routes' `loading.tsx` (WO-39 /
// ship-grade §4) so a slow query animates the list shape instead of blanking the page.
// (The old client-side "Load more" <PaginatedList> was replaced by numbered-page
// pagination — see `components/pagination.tsx`.) Palette-agnostic tints so it sits
// cleanly on either token set.
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
