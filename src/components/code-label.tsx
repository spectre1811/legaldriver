// WO-32 · Presentational wrapper for an expanded eCourts code: full human name primary, the raw
// code secondary (muted, and as the `title` tooltip so power users still see the code). Feed it the
// result of expandCaseType/expandDisposal/expandCode from "@/lib/court/code-labels".
import type { Expanded } from "@/lib/court/code-labels";

export function CodeLabel({
  value,
  className = "",
  codeClassName = "ml-1.5 font-mono text-[0.65rem] uppercase tracking-wide text-ink-faint",
  showCode = true,
  fallback = "—",
}: {
  value: Expanded | null | undefined;
  className?: string;
  codeClassName?: string;
  /** Show the raw code as a muted suffix (default). Set false to only tooltip it. */
  showCode?: boolean;
  /** Rendered when there's no value at all. */
  fallback?: string;
}) {
  if (!value || !value.full) return <>{fallback}</>;
  // Only show the code separately when it differs from the full name (else it's noise).
  const codeDiffers = value.code && value.code.toUpperCase() !== value.full.toUpperCase();
  return (
    <span className={className} title={value.code || undefined}>
      {value.full}
      {showCode && codeDiffers && <span className={codeClassName}>{value.code}</span>}
    </span>
  );
}
