// Pure: the strongest available explanation for why a document is proposed to file where it is
// (WO-33). Order mirrors the matching-signal strength (design §5): CNR > email arrival > party name.
// Kept pure (no i18n/IO) so it's unit-tested; the page maps the key to a localized string.
export function whyKey(d: { cnrs: string[]; source: string; parties: string[] }): "cnr" | "email" | "party" | null {
  if (d.cnrs.length > 0) return "cnr";
  if (d.source === "gmail") return "email";
  if (d.parties.length > 0) return "party";
  return null;
}
