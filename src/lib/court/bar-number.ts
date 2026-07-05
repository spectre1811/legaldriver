// WO-42 · Advocate bar-enrollment parsing + State Bar Council → eCourts token map.
//
// ⭐ CANONICAL FORMAT — founder-ruled 2026-07-05 (exec/LEARNINGS.md ⭐; do NOT re-litigate):
// a State Bar Council enrollment number is  STATE / SERIAL / YEAR, e.g. **`G/702/2020`**,
// `G/4732/1999` (Gujarat) or `MAH/1234/1982`. `STATE` = the state bar-council code
// (**Gujarat = `G`**); `SERIAL` = the ACTUAL bar code/number; `YEAR` = enrollment year (required).
//   ⚠️ A number like `11240` is NOT a serial — it is an INTERNAL eCourts system/display code
//   (the value that rides inline in `pet_adv` as `MR YASH J PATEL(11240)`). NEVER search the
//   roster by it. The eCourts search's `barcode` param is the SERIAL (`702`), not `11240`.
//   • The AIBE / BCI certificate number is a *separate national* id — irrelevant to eCourts.
//
// WHY VALID ADVOCATES GOT "0 CASES": the eCourts bar search (`searchByAdvocateName.php`,
// `checkedSearchByRadioValue:"2"`) REQUIRES four params — `barstatecode` (tier-dependent:
// "GJ" High Court / "GJG" Gujarat district — the eCourts token, distinct from the enrollment
// `STATE` letter "G"), `barcode` (the SERIAL), **`year`**, and numeric `state_code` (17).
// Onboarding never collected the year, so the search fell through to a lossy name match.
//   NB (founder probe, S-WO41ingest): even with the correct SERIAL + scope + warmed session the
//   live mobile search still returned 0 for advocates tried — getting a live NON-EMPTY roster is
//   a SEPARATE open engineering step (scope/session/tier), not a format question. The format is
//   settled; the empty-state stays honest until live retrieval is proven.
//
// This module is PURE (no I/O) so it is unit-tested offline. Token maps are SOURCED,
// never guessed: only councils whose tokens were packet-verified carry `verified:true`
// and drive a live eCourts roster fetch; the rest capture the enrollment + fall back to
// name search with an honest empty-state (unverified tokens tracked in exec/DATA-GAPS.md).

export interface ParsedBarNumber {
  stateBar: string; // the enrollment STATE code as entered, uppercased (e.g. "G", "MAH")
  serial: number; // the ACTUAL bar serial (e.g. 702) — NOT an eCourts internal code like 11240
  year: number; // enrollment year — REQUIRED by the eCourts bar search
  canonical: string; // normalized display string "STATE/SERIAL/YEAR"
}

// STATE (1-4 letters) / SERIAL (1-6 digits) / YEAR (4 digits, 19xx or 20xx).
// Separators (/, -, space) are optional so we accept "G 702 2020" and "G/702/2020"
// alike; the trailing 4-digit 19|20 year anchors the parse even without separators.
const BAR_RE = /^([A-Za-z]{1,4})[\/\-\s.]*(\d{1,6})[\/\-\s.]*((?:19|20)\d{2})$/;

export function parseBarNumber(input: string | null | undefined): ParsedBarNumber | null {
  if (!input) return null;
  const s = input.trim().toUpperCase();
  const m = BAR_RE.exec(s);
  if (!m) return null;
  const stateBar = m[1];
  const serial = Number(m[2]);
  const year = Number(m[3]);
  if (!serial || year < 1900 || year > 2100) return null;
  return { stateBar, serial, year, canonical: `${stateBar}/${serial}/${year}` };
}

export interface StateBarCouncil {
  id: string; // stable <select> value + stored token, matches the CNR state prefix (e.g. "GJ")
  label: string; // human name of the statutory body
  statePrefix: string | null; // the ENROLLMENT STATE letter(s) — Gujarat = "G" (⭐ ruling); distinct from the eCourts token
  stateCode: number | null; // eCourts numeric state_code (null until sourced)
  hcBarToken: string | null; // `barstatecode` for a High Court bar search
  dcBarToken: string | null; // `barstatecode` for a District bar search
  verified: boolean; // tokens packet-verified against eCourts → drives live search
}

// The State Bar Councils (statutory bodies — public). `verified:true` councils have
// packet-verified eCourts tokens and get a LIVE roster fetch; the rest capture the
// enrollment + year and fall back to name search with an honest empty-state.
//
// VERIFIED so far: Gujarat only — HC `barstatecode="GJ"`, District `"GJG"`,
// `state_code=17` (WO-34 mitmproxy capture; `scraper/mobile_api.py:search_by_advocate`,
// `docs/HC-ADVOCATE-SEARCH-CAPTURE.md`). Each additional state's tokens must be
// verified via the WO-43 MITM recon harness before flipping `verified` → true; the
// unverified backlog lives in `exec/DATA-GAPS.md`.
export const STATE_BAR_COUNCILS: StateBarCouncil[] = [
  // Gujarat: enrollment STATE prefix "G" (⭐ ruling) — distinct from the eCourts tokens GJ/GJG.
  { id: "GJ", label: "Gujarat", statePrefix: "G", stateCode: 17, hcBarToken: "GJ", dcBarToken: "GJG", verified: true },
  // Unverified — enrollment + year are captured and stored; live eCourts bar search is
  // withheld (honest empty-state) until the tokens are packet-verified (WO-43 → DATA-GAPS).
  // `statePrefix` stays null for these until each state's enrollment code is sourced (not guessed).
  { id: "MH", label: "Maharashtra & Goa", statePrefix: null, stateCode: null, hcBarToken: null, dcBarToken: null, verified: false },
  { id: "DL", label: "Delhi", statePrefix: null, stateCode: null, hcBarToken: null, dcBarToken: null, verified: false },
  { id: "UP", label: "Uttar Pradesh", statePrefix: null, stateCode: null, hcBarToken: null, dcBarToken: null, verified: false },
  { id: "RJ", label: "Rajasthan", statePrefix: null, stateCode: null, hcBarToken: null, dcBarToken: null, verified: false },
  { id: "MP", label: "Madhya Pradesh", statePrefix: null, stateCode: null, hcBarToken: null, dcBarToken: null, verified: false },
  { id: "KA", label: "Karnataka", statePrefix: null, stateCode: null, hcBarToken: null, dcBarToken: null, verified: false },
  { id: "TN", label: "Tamil Nadu & Puducherry", statePrefix: null, stateCode: null, hcBarToken: null, dcBarToken: null, verified: false },
  { id: "TG", label: "Telangana", statePrefix: null, stateCode: null, hcBarToken: null, dcBarToken: null, verified: false },
  { id: "AP", label: "Andhra Pradesh", statePrefix: null, stateCode: null, hcBarToken: null, dcBarToken: null, verified: false },
  { id: "KL", label: "Kerala", statePrefix: null, stateCode: null, hcBarToken: null, dcBarToken: null, verified: false },
  { id: "WB", label: "West Bengal", statePrefix: null, stateCode: null, hcBarToken: null, dcBarToken: null, verified: false },
  { id: "PB", label: "Punjab & Haryana", statePrefix: null, stateCode: null, hcBarToken: null, dcBarToken: null, verified: false },
  { id: "BR", label: "Bihar", statePrefix: null, stateCode: null, hcBarToken: null, dcBarToken: null, verified: false },
  { id: "OD", label: "Odisha", statePrefix: null, stateCode: null, hcBarToken: null, dcBarToken: null, verified: false },
  { id: "AS", label: "Assam, Nagaland, Mizoram, Arunachal, Sikkim", statePrefix: null, stateCode: null, hcBarToken: null, dcBarToken: null, verified: false },
  { id: "JH", label: "Jharkhand", statePrefix: null, stateCode: null, hcBarToken: null, dcBarToken: null, verified: false },
  { id: "CT", label: "Chhattisgarh", statePrefix: null, stateCode: null, hcBarToken: null, dcBarToken: null, verified: false },
  { id: "UK", label: "Uttarakhand", statePrefix: null, stateCode: null, hcBarToken: null, dcBarToken: null, verified: false },
  { id: "HP", label: "Himachal Pradesh", statePrefix: null, stateCode: null, hcBarToken: null, dcBarToken: null, verified: false },
  { id: "JK", label: "Jammu & Kashmir and Ladakh", statePrefix: null, stateCode: null, hcBarToken: null, dcBarToken: null, verified: false },
  { id: "OTHER", label: "Other / not listed", statePrefix: null, stateCode: null, hcBarToken: null, dcBarToken: null, verified: false },
];

export function stateBarCouncil(id: string | null | undefined): StateBarCouncil | null {
  if (!id) return null;
  return STATE_BAR_COUNCILS.find((c) => c.id === id.toUpperCase()) ?? null;
}

// Resolve a council from the ENROLLMENT state prefix (e.g. "G" → Gujarat) — the letters an
// advocate actually writes, which differ from the eCourts token/id (Gujarat: prefix "G", id
// "GJ"). Used only as a fallback when the dropdown didn't record the council. Matches on the
// sourced `statePrefix`, so an unsourced state (statePrefix=null) never false-matches.
export function councilByStatePrefix(prefix: string | null | undefined): StateBarCouncil | null {
  if (!prefix) return null;
  const p = prefix.toUpperCase();
  return STATE_BAR_COUNCILS.find((c) => c.statePrefix != null && c.statePrefix === p) ?? null;
}

// The scope of a single eCourts bar search. HC and District differ ONLY in scope:
// High Court uses `court_code`; a District complex uses `court_code_arr` (comma list of
// courts in the complex) + the district's `barstatecode` (e.g. "GJG"). We try both so a
// single-tier advocate is never missed.
export interface BarSearchScope {
  tier: "HC" | "DC";
  barState: string;
  stateCode: number;
  distCode?: number;
  courtCode?: number;
  courtCodeArr?: string;
}

// Build the ordered list of live eCourts bar-search scopes for a parsed enrollment +
// council. Empty when the council isn't verified (→ caller shows an honest empty-state
// and falls back to name search). HC is tried first (broadest), then the district complex.
//
// ⚠️ DISTRICT COVERAGE IS PARTIAL (WO-42, tracked in BACKLOG §D). HC is one court so its
// scope returns the FULL HC roster. The district scope, by contrast, is a SINGLE hardcoded
// complex (`dist_code=1, court_code_arr="1,5"` — the WO-34 capture example) — it does NOT
// cover other Gujarat districts/complexes. Full district coverage needs iterating the
// state's court/establishment map (`/courts/{state_code}`) → per-(dist_code, court_code_arr)
// searches — that mapping is unverified (overlaps BP-07's court_id map), so we do NOT guess
// it here. Callers must treat a district "0 results" as "none in HC + main district", not
// "none exist" (see `emptyRosterNote`).
export function barSearchScopes(council: StateBarCouncil): BarSearchScope[] {
  if (!council.verified || council.stateCode == null) return [];
  const scopes: BarSearchScope[] = [];
  if (council.hcBarToken) {
    scopes.push({ tier: "HC", barState: council.hcBarToken, stateCode: council.stateCode, distCode: 1, courtCode: 1 });
  }
  if (council.dcBarToken) {
    // court_code_arr "1,5" = the courts in ONE Gujarat district complex (WO-34 capture) —
    // a partial probe, not statewide district coverage (see the block comment above).
    scopes.push({ tier: "DC", barState: council.dcBarToken, stateCode: council.stateCode, distCode: 1, courtCodeArr: "1,5" });
  }
  return scopes;
}

// Diagnose why a roster fetch came back empty, so onboarding NEVER shows a bare
// "0 cases" that reads as "this advocate has none" (information-integrity guardrail).
export type EmptyRosterReason =
  | { kind: "unparsed" } // couldn't read the enrollment number at all
  | { kind: "unverified"; council: string } // valid enrollment, council not live yet
  | { kind: "no-results" }; // verified search ran but found nothing in the courts we searched (HC + main district only — NOT proof none exist)

export function diagnoseEmptyRoster(barNumber: string | null | undefined, councilId: string | null | undefined): EmptyRosterReason {
  const parsed = parseBarNumber(barNumber);
  if (!parsed) return { kind: "unparsed" };
  // Prefer the stored council token (dropdown), else infer from the enrollment STATE prefix
  // (e.g. "G" → Gujarat) — NOT the token id, since the advocate writes "G/…", not "GJ/…".
  const council = stateBarCouncil(councilId) ?? councilByStatePrefix(parsed.stateBar);
  if (!council || !council.verified) return { kind: "unverified", council: council?.label ?? parsed.stateBar };
  return { kind: "no-results" };
}
