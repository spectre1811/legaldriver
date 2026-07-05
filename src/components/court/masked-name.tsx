// BP-17 · MaskedName — renders eCourts protected-matter parties ("XXXXXXX") as an explicit
// "name withheld", never title-cased into "Xxxxxxx" (the peshi format.ts bug) and never usable as
// a match/search key. Pass an already-known-masked value, or let it self-guard: a non-masked value
// renders nothing (use resolveFieldState / CourtField to route the four states).
import { isMaskedName } from "./logic";
import { LockIcon } from "./icons";

export function MaskedName({
  value,
  label,
  className = "",
}: {
  value?: string | null;
  /** Override copy (e.g. a next-intl string). */
  label?: string;
  className?: string;
}) {
  if (value != null && !isMaskedName(value)) return null;
  return (
    <span
      className={`ec-chip inline-flex items-center gap-1 ${className}`.trim()}
      title="Protected matter — the court has withheld this name"
    >
      <LockIcon className="h-3 w-3" />
      {label ?? "name withheld (protected matter)"}
    </span>
  );
}
