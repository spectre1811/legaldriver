import { ListSkeleton } from "@/components/paginated-list";

// Route-level skeleton (WO-39 / ship-grade §4) — the cases list is the hero surface;
// animate the shape instead of blanking it while the query runs. WO-331: the flat
// `animate-pulse` blocks became the prototype's real `.shimmer` gradient (styles.css) —
// respects prefers-reduced-motion via the same blanket override every animation here rides.
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="shimmer h-7 w-32 rounded" />
        <div className="shimmer h-4 w-72 rounded" />
      </div>
      <div className="shimmer h-24 w-full rounded-xl border border-ec-hair" />
      <div className="shimmer h-10 w-full rounded-xl border border-ec-hair" />
      <ListSkeleton rows={8} />
    </div>
  );
}
