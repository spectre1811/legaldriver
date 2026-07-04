import { ListSkeleton } from "@/components/paginated-list";

// Route-level skeleton (WO-39 / ship-grade §4) — the judge dossier aggregates a caseload
// and can be slow; animate the shape instead of blanking the page.
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-56 animate-pulse rounded bg-black/5" />
        <div className="h-4 w-40 animate-pulse rounded bg-black/5" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border border-line bg-black/5" />
        ))}
      </div>
      <ListSkeleton rows={6} />
    </div>
  );
}
