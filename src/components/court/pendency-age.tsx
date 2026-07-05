// BP-17 · PendencyAge — colour-codes how long a case has been pending (mirrors eCourts' own age
// banding) and FREEZES at disposal so a closed case stops ageing. NEW. Bands/tones come from
// logic.ts (fresh→neutral, watch→warn, aging→hot, old→danger); no new CSS. Renders nothing when
// there's no usable filing date (the caller shows EmptyCell instead — one state, one component).
import { pendencyAge, pendencyTone } from "./logic";
import { CourtChip } from "./court-chip";

export function PendencyAge({
  filedDate,
  disposedDate,
  now,
  labels,
  className = "",
}: {
  filedDate: string | null | undefined;
  disposedDate?: string | null | undefined;
  /** Injectable reference date (deterministic tests); defaults to now at render. */
  now?: Date;
  labels?: { pending?: string; closed?: string };
  className?: string;
}) {
  const p = pendencyAge(filedDate, disposedDate, now);
  if (p.band === "unknown" || p.years == null) return null;
  const yrs = p.years < 1 ? "<1" : p.years.toFixed(1);
  const suffix = p.frozen ? (labels?.closed ?? "to disposal") : (labels?.pending ?? "pending");
  return (
    <CourtChip tone={pendencyTone(p.band)} className={className}>
      <span className="num">{yrs}y</span> {suffix}
    </CourtChip>
  );
}
