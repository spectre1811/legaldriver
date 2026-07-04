import { ListSkeleton } from "@/components/paginated-list";

// Route-level skeleton (WO-39 / ship-grade §4).
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-40 animate-pulse rounded bg-black/5" />
        <div className="h-4 w-72 animate-pulse rounded bg-black/5" />
      </div>
      <div className="h-28 w-full animate-pulse rounded-xl border border-line bg-black/5" />
      <ListSkeleton rows={6} />
    </div>
  );
}
