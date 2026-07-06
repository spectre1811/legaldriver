// WO-54 W1 · Normalize the platform's raw court-tier token to a small closed vocabulary so the Cases
// tier tabs/facets (Wave 2) are stable + non-fragmenting. The eCourts/platform `detail.tier` value is
// stored VERBATIM (un-normalized — e.g. "HIGH" for a High Court, and it's also used as a fallback
// court-name string), so indexing it raw would fragment the tabs ("HIGH" vs "High Court" vs a bench
// string). This pure map is the single source of truth for the `matter.tier` column: `upsertCase`
// writes `normalizeTier(detail.tier)`, the migration backfill mirrors this exact mapping, and a
// guardrail test locks the two together. Unknown → null (shows under "All"; never a fabricated tier).

export type CourtTier = "HC" | "DISTRICT" | "TRIBUNAL" | "SC";

export function normalizeTier(raw: unknown): CourtTier | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toUpperCase();
  if (!s) return null;
  // Order matters: check the more specific tribunal/supreme tokens before the broad HIGH/DISTRICT
  // prefix matches (a "HIGH COURT" bench string must map to HC, a "SESSIONS COURT" to DISTRICT).
  if (s.includes("TRIBUNAL") || s === "CAT" || s === "NCLT" || s === "NGT" || s === "DRT") return "TRIBUNAL";
  if (s === "SC" || s.startsWith("SUPREME")) return "SC";
  if (s === "HC" || s.startsWith("HIGH")) return "HC";
  if (s === "DIST" || s.startsWith("DISTRICT") || s.includes("SESSION")) return "DISTRICT";
  return null;
}
