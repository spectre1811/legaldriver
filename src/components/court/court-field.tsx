// BP-17 · CourtField — the four-state composition contract, enforced by construction.
// Charter AC7 requires every court field to render through EXACTLY ONE of
//   { populated → CourtChip/plain, EmptyCell, DirtyValue, MaskedName }.
// Routing that decision through a single pure resolver (logic.ts `resolveFieldState`) + one switch
// makes it impossible for a page to render two states, or none — you literally cannot forget a
// state. Pages that render a raw court value should reach for this instead of `value ?? "—"`.
import { resolveFieldState, type ChipTone } from "./logic";
import { CourtChip } from "./court-chip";
import { EmptyCell } from "./empty-cell";
import { DirtyValue } from "./dirty-value";
import { MaskedName } from "./masked-name";

export function CourtField({
  value,
  tone,
  code,
  field,
  emptyReason = "not-on-record",
  emptyLabel,
  maskedLabel,
  className = "",
}: {
  value: string | null | undefined;
  /** When populated, render inside a CourtChip of this tone; omit for plain text. */
  tone?: ChipTone;
  /** Raw code tooltip for the chip. */
  code?: string;
  /** Field name for the dirty back-pressure signal. */
  field?: string;
  emptyReason?: "not-on-record" | "not-applicable";
  emptyLabel?: string;
  maskedLabel?: string;
  className?: string;
}) {
  switch (resolveFieldState(value)) {
    case "empty":
      return <EmptyCell reason={emptyReason} label={emptyLabel} className={className} />;
    case "masked":
      return <MaskedName value={value} label={maskedLabel} className={className} />;
    case "dirty":
      return <DirtyValue raw={value as string} field={field} className={className} />;
    case "populated":
      return tone ? (
        <CourtChip tone={tone} code={code} className={className}>
          {value}
        </CourtChip>
      ) : (
        <span className={className}>{value}</span>
      );
  }
}
