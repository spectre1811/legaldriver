import { ListSkeleton } from "@/components/paginated-list";

// Route-level skeleton (WO-39 / ship-grade §4). Calendar queries are date-window-bounded
// (correct by design); this just keeps a slow render from blanking the page.
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-36 animate-pulse rounded bg-black/5" />
        <div className="h-4 w-72 animate-pulse rounded bg-black/5" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-7 w-20 animate-pulse rounded-full bg-black/5" />
        ))}
      </div>
      <ListSkeleton rows={6} />
    </div>
  );
}
