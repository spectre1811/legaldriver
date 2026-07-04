import { ListSkeleton } from "@/components/paginated-list";

// Route-level skeleton (WO-39 / ship-grade §4) — the cases list is the hero surface;
// animate the shape instead of blanking it while the query runs.
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-32 animate-pulse rounded bg-black/5" />
        <div className="h-4 w-72 animate-pulse rounded bg-black/5" />
      </div>
      <div className="h-24 w-full animate-pulse rounded-xl border border-line bg-black/5" />
      <div className="h-10 w-full animate-pulse rounded-xl border border-line bg-black/5" />
      <ListSkeleton rows={8} />
    </div>
  );
}
