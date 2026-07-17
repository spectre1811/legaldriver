import { Icon, type IconName } from "@/components/icons";

// WO-147 W4 — onboarding stepper (design-system-v2 §7 + RECONCILIATION-2026-07-16):
// 3 steps (Bar ID → Fetch & verify → Practice assembled), hairline connectors, gold
// current-step dot, smallcap labels. `current` is derived from real state by the page
// (no advocates → 0; a run in flight → 1; matters synced → 2), never fabricated.
export type Step = { label: string; icon: IconName };

export function Stepper({ steps, current }: { steps: Step[]; current: number }) {
  return (
    // Horizontal by nature. It compresses to fit a phone (labels wrap to 2 lines, tight
    // connectors); the overflow wrapper is the safety net so a very long label can never
    // clip the last step against the card edge.
    <div className="-mx-1 overflow-x-auto px-1">
    <ol className="flex items-center">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.label} className="flex flex-1 items-center last:flex-none">
            <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
              <span
                aria-current={active ? "step" : undefined}
                className={[
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums ring-1 transition",
                  active
                    ? "bg-ec-honey text-ec-ink ring-ec-honey"
                    : done
                      ? "bg-ec-bronze-tint text-ec-ink ring-ec-hair"
                      : "bg-ec-paper text-ec-ink-3 ring-ec-hair",
                ].join(" ")}
              >
                {done ? <Icon name="check" className="h-4 w-4" /> : <Icon name={s.icon} className="h-4 w-4" />}
              </span>
              <span className={`label max-w-[5.5rem] leading-tight sm:max-w-[8rem] ${active ? "text-ec-ink" : "text-ec-ink-3"}`}>
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              // Hairline connector — honey once the prior step is complete, else the hairline rule.
              <span className={`mx-1 mb-6 h-px min-w-[0.75rem] flex-1 ${i < current ? "bg-ec-honey" : "bg-ec-hair"}`} aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
    </div>
  );
}
