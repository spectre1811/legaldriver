// Route-level skeleton (WO-39 / ship-grade §4). Matches this page's own shape (WO-336): the ink
// masthead band, three channel-health tiles, the per-case table, and the ledger list.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-8" aria-busy="true" aria-live="polite">
      <div className="h-28 w-full rounded-xl bg-ec-ink/90" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 rounded-ec-m bg-black/5" />
        ))}
      </div>
      <div className="h-48 w-full rounded-ec-m bg-black/5" />
      <div className="ec-card divide-y divide-ec-hair">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <div className="h-4 w-4 rounded-full bg-black/5" />
            <div className="h-4 flex-1 rounded bg-black/5" />
            <div className="h-4 w-24 rounded bg-black/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
