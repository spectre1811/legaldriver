// BP-17 · Court-data component kit — PURE logic core (no React, no Supabase, no server-only
// imports). Every band/parse/detect decision the kit makes lives here so it can be unit-tested
// in isolation (tests/bp17_court_kit.ts) and reused byte-identically by peshi-search (which has
// NO tenant/Supabase code by hard guardrail). The .tsx components are thin renderers over these.
//
// Information-integrity (protocol §5, information-integrity.md): these functions NEVER fabricate.
// An unknown/absent value maps to an explicit state ("empty"/"unknown"), never a guessed one.

// ── chip tone → class ────────────────────────────────────────────────────────
// The single tone→class map. Kills the three duplicate maps the audit found
// (`chip()` in cases page, `TYPE_CHIP` in the timeline, `ui.tsx TONES`).
export type ChipTone = "neutral" | "success" | "warn" | "danger" | "hot";

const CHIP_CLASS: Record<ChipTone, string> = {
  neutral: "ec-chip",
  success: "ec-chip ec-chip-success",
  warn: "ec-chip ec-chip-warn",
  danger: "ec-chip ec-chip-danger",
  hot: "ec-chip ec-chip-hot",
};

export function chipToneClass(tone: ChipTone): string {
  return CHIP_CLASS[tone] ?? CHIP_CLASS.neutral;
}

// ── confidence ───────────────────────────────────────────────────────────────
// Bands mirror the FG-3 entity-resolution thresholds (2026-07-05 founder ruling):
// auto-merge ≥0.90 (high), review queue 0.75–0.90 (medium), never below (low).
// Rendering these consistently across search/causelist/dossier keeps "how sure are we"
// legible wherever a fuzzy match is shown.
export type ConfidenceBand = "high" | "medium" | "low";

export const CONFIDENCE_HIGH = 0.9;
export const CONFIDENCE_MED = 0.75;

export function confidenceBand(input: number | ConfidenceBand): ConfidenceBand {
  if (typeof input === "string") return input;
  if (!Number.isFinite(input)) return "low";
  const s = input > 1 ? input / 100 : input; // tolerate 0–100 or 0–1
  if (s >= CONFIDENCE_HIGH) return "high";
  if (s >= CONFIDENCE_MED) return "medium";
  return "low";
}

export function confidenceTone(band: ConfidenceBand): ChipTone {
  return band === "high" ? "success" : band === "medium" ? "warn" : "neutral";
}

// ── interpretation (fact vs our reading of it) ───────────────────────────────
// Adjournment-vs-substantive is an INTERPRETATION, not a court fact, so it must always be
// visually distinct and carry its confidence (charter: never present a guess as a record).
export type InterpretationLabel = "substantive" | "adjourned" | "uncertain";

export function interpretationTone(label: InterpretationLabel): ChipTone {
  return label === "substantive" ? "success" : label === "adjourned" ? "warn" : "neutral";
}

// ── masked / protected names ─────────────────────────────────────────────────
// eCourts masks protected-matter parties as "XXXXXXX". Detect so the kit renders
// "name withheld (protected matter)" instead of title-casing junk into "Xxxxxxx"
// (the peshi format.ts bug) — and so a masked value is NEVER used as a match/search key.
export function isMaskedName(value: string | null | undefined): boolean {
  if (!value) return false;
  const compact = value.replace(/[\s.]/g, "");
  return compact.length >= 4 && /^x+$/i.test(compact);
}

// ── dirty values (un-decoded / junk) ─────────────────────────────────────────
// A value is "dirty" when it still carries transport artefacts the source leaked — raw or
// double-encoded HTML entities — which React would render literally. DirtyValue surfaces it
// as an explicit fallback (and fires a back-pressure hook) instead of silently rendering junk.
const ENTITY_RE = /&(amp|lt|gt|quot|apos|#0?39|#x?[0-9a-f]+);/i;

export function looksDirty(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return ENTITY_RE.test(raw);
}

// Shared HTML-entity decoder (handles the double-encoding the /timeline endpoint leaks,
// e.g. "&amp;amp;"). Ported from case-timeline.tsx so there is ONE decoder in the kit.
export function decodeEntities(s: string | null | undefined): string {
  if (!s) return "";
  let t = s;
  for (let i = 0; i < 2; i++) {
    t = t
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/&apos;/g, "'");
  }
  return t.trim();
}

// ── four-state field contract ────────────────────────────────────────────────
// Charter AC7: every court field renders through EXACTLY ONE of these four states. Making the
// resolver a single pure function means <CourtField> can't accidentally render two (or none).
export type FieldState = "populated" | "empty" | "dirty" | "masked";

export function resolveFieldState(value: string | null | undefined): FieldState {
  if (value == null || value.trim() === "") return "empty";
  if (isMaskedName(value)) return "masked";
  if (looksDirty(value)) return "dirty";
  return "populated";
}

// ── dates ────────────────────────────────────────────────────────────────────
// eCourts serves dates as DD-MM-YYYY (and DD/MM/YYYY). `new Date("13-05-2024")` is
// invalid/locale-dependent in V8 — the peshi format.ts bug that renders empty-vs-dirty
// wrong. Parse explicitly, day-first, and only accept real calendar dates.
const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

export function parseCourtDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  // ISO / RFC first (already unambiguous) — but only date-shaped, not arbitrary junk.
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ]|$)/);
  if (iso) return makeDate(+iso[3], +iso[2] - 1, +iso[1]);

  // DD-MM-YYYY or DD/MM/YYYY (day-first — the eCourts convention).
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (dmy) {
    const yr = dmy[3].length === 2 ? 2000 + +dmy[3] : +dmy[3];
    return makeDate(+dmy[1], +dmy[2] - 1, yr);
  }

  // DD-Mon-YYYY (e.g. "13-May-2024").
  const dMonY = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{2,4})$/);
  if (dMonY) {
    const mo = MONTHS[dMonY[2].slice(0, 3).toLowerCase()];
    if (mo === undefined) return null;
    const yr = dMonY[3].length === 2 ? 2000 + +dMonY[3] : +dMonY[3];
    return makeDate(+dMonY[1], mo, yr);
  }
  return null;
}

// Build a date and reject overflow (e.g. 31-02 rolling into March) so a bad value
// becomes "dirty"/empty rather than a plausible-looking wrong date.
function makeDate(day: number, monthIdx: number, year: number): Date | null {
  if (year < 1900 || year > 2200 || monthIdx < 0 || monthIdx > 11 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, monthIdx, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== monthIdx || d.getUTCDate() !== day) return null;
  return d;
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Deterministic DD Mon YYYY formatter (no locale/timezone drift — reads the UTC parts we set).
export function formatCourtDate(raw: string | null | undefined): string | null {
  const d = parseCourtDate(raw);
  if (!d) return null;
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTH_ABBR[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// ── pendency age ─────────────────────────────────────────────────────────────
// Colour-codes how long a case has been pending (mirrors eCourts' own age banding), and
// FREEZES at the disposal date so a closed case doesn't keep "ageing". `now` is injectable
// for deterministic tests. Bands reuse existing chip tones — no new CSS.
export type PendencyBand = "fresh" | "watch" | "aging" | "old" | "unknown";

export interface Pendency {
  band: PendencyBand;
  years: number | null;
  frozen: boolean; // true when measured to a disposal date (case closed)
}

export function pendencyAge(
  filed: string | null | undefined,
  disposed?: string | null | undefined,
  now: Date = new Date(),
): Pendency {
  const start = parseCourtDate(filed);
  if (!start) return { band: "unknown", years: null, frozen: false };
  const end = parseCourtDate(disposed) ?? now;
  const frozen = Boolean(parseCourtDate(disposed));
  const years = (end.getTime() - start.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (years < 0) return { band: "unknown", years: null, frozen };
  const band: PendencyBand = years < 1 ? "fresh" : years < 3 ? "watch" : years < 5 ? "aging" : "old";
  return { band, years, frozen };
}

export function pendencyTone(band: PendencyBand): ChipTone {
  return band === "old" ? "danger" : band === "aging" ? "hot" : band === "watch" ? "warn" : "neutral";
}

// ── staleness ────────────────────────────────────────────────────────────────
// Is the last sync older than the freshness SLO? (The SLO numeric value itself is FG-8 —
// the caller passes sloHours; the kit just compares.) `now` injectable for tests.
export interface Staleness {
  stale: boolean;
  ageHours: number | null;
}

export function stalenessState(
  lastSynced: string | null | undefined,
  sloHours: number,
  now: Date = new Date(),
): Staleness {
  if (!lastSynced) return { stale: true, ageHours: null }; // never synced = stale by definition
  const t = new Date(lastSynced).getTime();
  if (Number.isNaN(t)) return { stale: true, ageHours: null };
  const ageHours = (now.getTime() - t) / 3600000;
  return { stale: ageHours > sloHours, ageHours };
}

// Relative "x ago" for provenance/staleness copy (deterministic via injectable `now`).
export function relativeAge(ts: string | null | undefined, now: Date = new Date()): string {
  if (!ts) return "never";
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return "never";
  const mins = Math.round((now.getTime() - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
