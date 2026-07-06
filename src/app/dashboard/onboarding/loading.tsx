// WO-61 W3: route-level skeleton (ship-grade §4 / ui-polish-bar "loading is designed") — the onboarding
// page is `force-dynamic` (Supabase round-trip), so animate the shape instead of blanking it.
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-56 animate-pulse rounded bg-black/5" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-black/5" />
      </div>
      <div className="h-28 w-full animate-pulse rounded-xl border border-line bg-black/5" />
      <div className="h-52 w-full animate-pulse rounded-xl border border-line bg-black/5" />
    </div>
  );
}
