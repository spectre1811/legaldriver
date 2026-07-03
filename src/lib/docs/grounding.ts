// Grounding guard (WO-33 W3 · research §3 "double-lock") — the classifier can HALLUCINATE a case
// number or party that isn't in the document; if we trust it, resolveFiling would auto-create/attach
// to the WRONG case. So we verify every extracted CNR literally appears in the source text and drop
// the ones that don't. Pure + unit-tested; called centrally in classifyDocument so all intake paths
// (upload, email, worker) are protected.

// Normalize for a forgiving substring check: uppercase, strip everything but A–Z0–9 (CNRs are often
// printed with spaces/hyphens the OCR may or may not preserve).
function squash(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// A CNR is a 16-char alphanumeric case id. Keep only those (a) shaped like a CNR and (b) actually
// present in the document text.
export function groundCnrs(cnrs: string[] | undefined, text: string): string[] {
  if (!cnrs?.length) return [];
  const hay = squash(text);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of cnrs) {
    const c = (raw ?? "").trim();
    const sq = squash(c);
    if (sq.length !== 16) continue; // not CNR-shaped → discard (format guard)
    if (seen.has(sq)) continue;
    if (hay.includes(sq)) { seen.add(sq); out.push(c.toUpperCase()); }
  }
  return out;
}
