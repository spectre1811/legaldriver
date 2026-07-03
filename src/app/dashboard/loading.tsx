// Route-level loading skeleton for the dashboard segment (tokened, textless →
// no i18n needed). Respects prefers-reduced-motion via globals.css.
export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-live="polite">
      <div className="h-8 w-56 rounded-ec-s bg-ec-paper-3" />
      <div className="flex gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 w-16 rounded-ec-s bg-ec-paper-3" />
        ))}
      </div>
      <div className="ec-card divide-y divide-ec-hair">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <div className="h-8 w-8 rounded-ec-s bg-ec-paper-3" />
            <div className="h-4 flex-1 rounded-ec-s bg-ec-paper-3" />
            <div className="h-8 w-20 rounded-ec-s bg-ec-paper-3" />
          </div>
        ))}
      </div>
    </div>
  );
}
