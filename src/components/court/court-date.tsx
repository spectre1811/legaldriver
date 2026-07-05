// BP-17 · CourtDate — robust day-first date rendering. Fixes the peshi format.ts bug where
// `new Date("13-05-2024")` is invalid/locale-dependent in V8 and rendered empty-vs-dirty wrong.
// Parses DD-MM-YYYY / DD/MM/YYYY / DD-Mon-YYYY / ISO (logic.ts). Unparseable → the four-state
// fallback: empty when blank, DirtyValue when it's junk we can't parse.
import { formatCourtDate } from "./logic";
import { EmptyCell } from "./empty-cell";
import { DirtyValue } from "./dirty-value";

export function CourtDate({
  value,
  kind,
  emptyLabel,
  className = "",
}: {
  value: string | null | undefined;
  /** business = filing/registration date; hearing = a sitting date. Reserved for kind-aware copy. */
  kind?: "business" | "hearing";
  emptyLabel?: string;
  className?: string;
}) {
  void kind;
  const formatted = formatCourtDate(value);
  if (formatted) return <span className={`num ${className}`.trim()}>{formatted}</span>;
  if (value == null || value.trim() === "") return <EmptyCell reason="not-on-record" label={emptyLabel} className={className} />;
  return <DirtyValue raw={value} field="date" className={className} />;
}
