import { ListSkeleton } from "@/components/paginated-list";

// Route-level skeleton (WO-39 / ship-grade §4). Matches the Chambers header shape (WO-333):
// title + count chip, subtitle, search + add-client row, then the roster.
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-40 animate-pulse rounded bg-black/5" />
        <div className="h-4 w-64 animate-pulse rounded bg-black/5" />
      </div>
      <div className="flex gap-2">
        <div className="h-9 w-64 max-w-full animate-pulse rounded-ec-s bg-black/5" />
        <div className="h-9 w-28 animate-pulse rounded-ec-s bg-black/5" />
      </div>
      <ListSkeleton rows={6} />
    </div>
  );
}
