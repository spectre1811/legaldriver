import { ListSkeleton } from "@/components/paginated-list";

// Route-level skeleton (WO-39 / ship-grade §4) — the directory runs live name/case searches
// against the court corpus and can be slow; animate the shape instead of blanking the page.
// WO-337 WAVE-2: mirrors the reconciled page's own shape — the ink masthead band, search well,
// case-number row, and three result sections. `.shimmer` gradient (styles.css, ported WO-331),
// not a flat pulse — respects prefers-reduced-motion via the same blanket override every
// animation here rides.
export default function Loading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2 rounded-xl bg-ec-ink/90 px-5 py-7 sm:px-8">
        <div className="shimmer h-7 w-64 rounded" />
        <div className="shimmer h-4 w-72 max-w-full rounded" />
      </div>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="shimmer h-14 w-full rounded-lg" />
        <div className="shimmer h-9 w-full max-w-md rounded-md" />
        <div className="grid gap-6 lg:grid-cols-2">
          <ListSkeleton rows={5} />
          <ListSkeleton rows={5} />
        </div>
        <ListSkeleton rows={4} />
      </div>
    </div>
  );
}
