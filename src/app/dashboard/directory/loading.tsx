import { ListSkeleton } from "@/components/paginated-list";

// Route-level skeleton (WO-39 / ship-grade §4) — the directory runs live name/case
// searches against the court corpus and can be slow; animate the shape instead of
// blanking the page. Mirrors the page's header + search well + two-column results.
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-64 animate-pulse rounded bg-black/5" />
        <div className="h-4 w-80 animate-pulse rounded bg-black/5" />
      </div>
      <div className="h-14 animate-pulse rounded-xl border border-line bg-black/5" />
      <div className="grid gap-6 lg:grid-cols-2">
        <ListSkeleton rows={5} />
        <ListSkeleton rows={5} />
      </div>
    </div>
  );
}
