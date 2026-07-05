// BP-17 · DirtyValue — the explicit "the source gave us something we couldn't clean" state.
// Instead of silently rendering un-decoded junk (or hiding it), it shows the decoded value in a
// distinct mono style with a dotted warn underline, and stamps `data-dirty-field` so a QA sweep
// or client-side observer can back-pressure a fix (the "reportDirtyField" signal — done as a data
// attribute so the component stays server-render-safe, no side-effect during render).
import { decodeEntities } from "./logic";

export function DirtyValue({
  raw,
  field,
  className = "",
}: {
  raw: string;
  /** Which field this is (surfaced on the data attribute for back-pressure tickets). */
  field?: string;
  className?: string;
}) {
  return (
    <span
      data-dirty-field={field ?? ""}
      title="This value arrived malformed from the source and may be incomplete — verify against the official record."
      className={`font-mono text-ec-ink-2 underline decoration-ec-warn decoration-dotted underline-offset-2 ${className}`.trim()}
    >
      {decodeEntities(raw)}
    </span>
  );
}
