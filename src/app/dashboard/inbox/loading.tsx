// Route-level skeleton (WO-39 / ship-grade §4) — the 4th designed state (loading), matching
// the Chambers header + sync-card + list/detail split shape (WO-335) the way clients/loading.tsx
// (WO-333) and cases/loading.tsx already do for their own pages.
export default function Loading() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="space-y-2">
        <div className="h-7 w-40 animate-pulse rounded bg-black/5" />
        <div className="h-4 w-64 animate-pulse rounded bg-black/5" />
      </div>
      <div className="h-24 animate-pulse rounded-ec-m bg-black/5" />
      <div className="flex gap-2">
        <div className="h-8 w-64 animate-pulse rounded-ec-s bg-black/5" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-ec-s bg-black/5" />
          ))}
        </div>
        <div className="hidden h-96 animate-pulse rounded-ec-s bg-black/5 lg:block" />
      </div>
    </div>
  );
}
