// BP-17 · EmptyCell — the explicit "no value" state. Replaces the bare "—" the audit found in
// info grids, which is ambiguous (is it not-on-record, or not-yet-loaded?). Says WHY the cell is
// empty, in italic muted ink. Copy is prop-driven (English default) so peshi/next-intl callers
// pass a translated string without the kit importing i18n.
export function EmptyCell({
  reason = "not-on-record",
  label,
  className = "",
}: {
  reason?: "not-on-record" | "not-applicable";
  /** Override copy (e.g. a next-intl string). */
  label?: string;
  className?: string;
}) {
  const text = label ?? (reason === "not-applicable" ? "not applicable" : "not on the court record");
  return <span className={`italic text-ec-ink-3 ${className}`.trim()}>{text}</span>;
}
