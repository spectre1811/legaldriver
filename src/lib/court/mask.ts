// BP-24 · Protected-matter (PII) display helpers for the Cases surface.
//
// eCourts masks protected-matter parties (matrimonial / POCSO / juvenile) as "XXXXXXX". A masked
// value must NEVER render verbatim (it would show "XXXXXXX v. XXXXXXX" in a title / party row / a
// live search link for "XXXXXXX"). These pure helpers reuse the ONE mask detector in the BP-17 kit
// (`isMaskedName`, which tolerates any run of X's + spacing) so ingest, sync, render and tests all
// agree on what "masked" means. Components render masked values via <MaskedName/>; these string
// helpers cover the plain-string contexts (composed titles) where a component can't slot in.
import { isMaskedName } from "@/components/court/logic";

export { isMaskedName };

// Concise label for title/plain-string contexts (the component uses the longer parenthetical form).
export const MASKED_NAME_LABEL = "name withheld";

/** A single name → itself, or the withheld label when the court has masked it. */
export function maskName(value: string | null | undefined, label = MASKED_NAME_LABEL): string {
  if (!value) return "";
  return isMaskedName(value) ? label : value;
}

/**
 * Mask a composed case title. Titles are built as "Petitioner v. Respondent"; either side can be
 * masked independently, so split on the canonical " v. " separator and mask each side. A title that
 * isn't in that shape (e.g. a bare CNR fallback) is returned masked-or-verbatim as a whole.
 */
export function maskTitle(title: string | null | undefined, label = MASKED_NAME_LABEL): string {
  if (!title) return "";
  const parts = title.split(" v. ");
  if (parts.length === 2) return `${maskName(parts[0], label)} v. ${maskName(parts[1], label)}`;
  return maskName(title, label);
}
