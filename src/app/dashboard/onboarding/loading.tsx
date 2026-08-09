// Route-level skeleton (ship-grade §4 / ui-polish-bar "loading is designed") — the onboarding
// page is `force-dynamic` (Supabase round-trip), so animate the shape instead of blanking it.
// WO-338: matches the Daybreak/Chambers shape (eyebrow + title, stepper strip, add-advocate
// card, roster rows, "what you get" rail) using the prototype's real `.shimmer` gradient
// (WO-331), not a flat pulse — respects prefers-reduced-motion via the same blanket override
// every animation in this repo rides.
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="shimmer h-3 w-16 rounded" />
        <div className="shimmer h-7 w-56 rounded" />
        <div className="shimmer h-4 w-96 max-w-full rounded" />
      </div>
      <div className="shimmer h-20 w-full rounded-ec-m border border-ec-hair" />
      <div className="grid gap-9 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-8">
          <div className="shimmer h-40 w-full rounded-ec-m border border-ec-hair" />
          <div className="space-y-4">
            <div className="shimmer h-16 w-full rounded-ec-m border border-ec-hair" />
            <div className="shimmer h-16 w-full rounded-ec-m border border-ec-hair" />
          </div>
        </div>
        <div className="hidden space-y-4 lg:block">
          <div className="shimmer h-48 w-full rounded-ec-m border border-ec-hair" />
          <div className="shimmer h-28 w-full rounded-ec-m border border-ec-hair" />
        </div>
      </div>
    </div>
  );
}
