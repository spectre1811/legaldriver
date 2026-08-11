"use client";

// WO-147 W2 · Segmented control — the toolbar's dominant-axis filters (court tier, open/disposed,
// list/agenda). One row, live count per option. Replaces the two stacked pill strips (CasesTierTabs
// + status tabs) with a single compact control per §6 anti-clutter contract.
// WO-331 EXACT-FIDELITY: active fill retoned from ink to the reference's own Segmented
// (design-mockups/iteration3/console/ui.tsx) — bronze-tint/bronze-deep, not an ink pill — and the
// count badge always reads muted-ink (the reference never re-colours it for the active option).
type Opt = { value: string; label: string; count?: number };

export function Segmented({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: Opt[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex items-center gap-0.5 rounded-ec-s border border-ec-hair bg-ec-paper p-0.5"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value || "all"}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            disabled={disabled}
            className={`inline-flex items-center gap-1.5 rounded-ec-s px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-indigo disabled:opacity-60 ${
              // WO-404 C2 re-check: inactive options were text-ec-ink-2 (#4A4A45, near-black) —
              // almost as dark as the active option's text-ec-bronze-deep (#5E461F), so an inactive
              // tab (e.g. "Agenda") visually competed with the active one instead of receding
              // (founder-flagged "uneven"). The reference Segmented (ui.tsx) uses muted-ink for the
              // resting state and only steps up to ink-2 on hover — matched here.
              active ? "bg-ec-bronze-tint text-ec-bronze-deep" : "text-ec-muted-ink hover:bg-ec-paper-3 hover:text-ec-ink-2"
            }`}
          >
            {o.label}
            {o.count != null && <span className="num font-mono text-[10.5px] text-ec-muted-ink">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
