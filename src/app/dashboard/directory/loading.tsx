import { ListSkeleton } from "@/components/paginated-list";

// Route-level skeleton (WO-39 / ship-grade §4) — the directory runs live name/case
// searches against the court corpus and can be slow; animate the shape instead of
// blanking the page. Mirrors the page's header + search well + case-number row +
// three result sections. WO-337: the flat `animate-pulse` blocks became the
// prototype's real `.shimmer` gradient (styles.css, ported WO-331) — respects
// prefers-reduced-motion via the same blanket override every animation here rides.
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2 border-b border-ec-hair pb-5">
        <div className="shimmer h-7 w-64 rounded" />
        <div className="shimmer h-4 w-96 rounded" />
      </div>
      <div className="shimmer h-14 w-full rounded-lg" />
      <div className="shimmer h-9 w-full max-w-md rounded-ec-s" />
      <div className="grid gap-6 lg:grid-cols-2">
        <ListSkeleton rows={5} />
        <ListSkeleton rows={5} />
      </div>
      <ListSkeleton rows={4} />
    </div>
  );
}
