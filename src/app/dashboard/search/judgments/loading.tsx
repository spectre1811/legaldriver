// Route-level skeleton (WO-289) — Judgments now runs a live BM25 order-text search per render
// (force-dynamic); animate the shape instead of blanking the page while it resolves. Next.js wraps
// the route segment in <Suspense fallback={<Loading/>}> automatically because this file exists.
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-56 animate-pulse rounded bg-ec-hair/60" />
        <div className="h-4 w-96 animate-pulse rounded bg-ec-hair/60" />
      </div>
      <div className="h-10 animate-pulse rounded-ec-s border border-ec-hair bg-ec-hair/40" />
      <div className="ec-card overflow-hidden">
        <div className="h-11 border-b border-ec-hair bg-ec-paper-3" />
        <ul className="divide-y divide-ec-hair">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} className="space-y-2 px-5 py-4">
              <span className="block h-4 w-2/3 animate-pulse rounded bg-ec-hair/60" />
              <span className="block h-3 w-1/3 animate-pulse rounded bg-ec-hair/40" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
