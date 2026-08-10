// WO-332 · SectionLabel — the Chambers "eyebrow + hairline" header that sits ABOVE a card,
// ported from the Daybreak prototype's design-mockups/iteration3/console/ui.tsx SectionLabel.
// Page-local (not every dashboard page shares this exact chrome yet — see the WO's non-goal
// against touching other pages' shared components); pulled out once here so this page's ~8
// sections don't each hand-roll the same eyebrow+rule markup.
import type { ReactNode } from "react";

export function SectionLabel({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-end justify-between gap-3">
        <div className="ec-label">{children}</div>
        {right}
      </div>
      <div className="mt-1.5 h-[3px] border-y border-ec-line" />
    </div>
  );
}
