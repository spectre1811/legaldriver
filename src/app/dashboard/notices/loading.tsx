import { ListSkeleton } from "@/components/paginated-list";

// Route-level skeleton (WO-39 / ship-grade §4): a slow notices query animates the
// list shape instead of blanking the page.
export default function Loading() {
  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <div className="h-7 w-44 animate-pulse rounded bg-black/5" />
        <div className="h-4 w-72 animate-pulse rounded bg-black/5" />
      </div>
      <div className="h-24 w-full animate-pulse rounded-xl border border-line bg-black/5" />
      <ListSkeleton rows={4} />
    </div>
  );
}
