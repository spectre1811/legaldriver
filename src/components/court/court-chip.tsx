// BP-17 · CourtChip — the ONE chip primitive. Wraps the `.ec-chip*` classes behind a single
// tone→class map (logic.ts `chipToneClass`), replacing the three drifted maps the audit found:
// `chip()` (cases page), `TYPE_CHIP` (timeline), and `ui.tsx Badge`/`TONES`.
import type { ChipTone } from "./logic";
import { chipToneClass } from "./logic";

export function CourtChip({
  tone = "neutral",
  code,
  className = "",
  children,
}: {
  tone?: ChipTone;
  /** Raw code shown as the hover `title` (e.g. the eCourts stage code behind a label). */
  code?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={`${chipToneClass(tone)} ${className}`.trim()} title={code || undefined}>
      {children}
    </span>
  );
}
