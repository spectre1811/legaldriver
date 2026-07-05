// BP-17 · ProvenanceChip — the mandatory "source: eCourts · refreshed X" line (conventions §3).
// Replaces the hand-rolled inline strings on the cases page, cases-list, judge footer, and peshi's
// forked provenance.tsx. Pure/prop-driven: copy comes in as props (English defaults) so both apps
// render it identically. `variant` picks inline (a subtle line) vs footer (top-bordered block).
import { relativeAge } from "./logic";

export function ProvenanceChip({
  source,
  lastSyncedAt,
  variant = "inline",
  now,
  sourceLabel = "source",
  neverLabel = "not yet refreshed",
  className = "",
}: {
  /** Provenance source, e.g. "eCourts" or "manual". */
  source: string | null | undefined;
  lastSyncedAt: string | null | undefined;
  variant?: "inline" | "footer";
  now?: Date;
  sourceLabel?: string;
  neverLabel?: string;
  className?: string;
}) {
  const src = source?.trim() || "—";
  const when = lastSyncedAt ? relativeAge(lastSyncedAt, now) : neverLabel;
  const base = "flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-ec-ink-3";
  const chrome = variant === "footer" ? "border-t border-ec-hair pt-2" : "";
  return (
    <p className={`${base} ${chrome} ${className}`.trim()}>
      <span>
        {sourceLabel}: <span className="font-medium text-ec-ink-2">{src}</span>
      </span>
      <span aria-hidden="true">·</span>
      <span className="num">{when}</span>
    </p>
  );
}
