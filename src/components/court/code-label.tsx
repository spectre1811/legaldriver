// BP-17 · CodeLabel (folded in from WO-32) — presentational wrapper for an expanded eCourts code:
// full human name primary, the raw code secondary (muted `ec-n400`, and as the `title` tooltip so
// power users still see the code). Feed it the result of expandCaseType/expandDisposal/expandCode.
//
// Decoupled from @/lib/court/code-labels: takes the structural shape below so the kit stays pure
// and peshi consumes it against its own ported code-labels (identical shape).
export interface CodeLabelValue {
  /** Full human name to show as primary. */
  full: string;
  /** Original short code, shown muted/secondary + as the title. */
  code: string;
  known?: boolean;
  isRole?: boolean;
}

export function CodeLabel({
  value,
  className = "",
  codeClassName = "ml-1.5 font-mono text-[0.65rem] uppercase tracking-wide text-ec-n400",
  showCode = true,
  fallback = "—",
}: {
  value: CodeLabelValue | null | undefined;
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
