"use client";

// WO-147 W2 · Segmented control — the toolbar's dominant-axis filters (court tier, open/disposed).
// One row, ink-fill on the active option, live count per option. Replaces the two stacked pill
// strips (CasesTierTabs + status tabs) with a single compact control per §6 anti-clutter contract.
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
              active ? "bg-ec-ink text-ec-paper" : "text-ec-ink-2 hover:bg-ec-paper-3 hover:text-ec-ink"
            }`}
          >
            {o.label}
            {o.count != null && (
              <span
                className={`num rounded-ec-s px-1 py-0.5 text-[0.6rem] ${
                  active ? "bg-ec-paper/20 text-ec-paper" : "bg-ec-hair text-ec-ink-3"
                }`}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
