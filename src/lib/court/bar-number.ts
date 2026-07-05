// WO-42 · Advocate bar-enrollment parsing + State Bar Council → eCourts token map.
//
// ⭐ CANONICAL FORMAT (founder-ruled 2026-07-05 — do not re-litigate; mirrored in exec/LEARNINGS.md):
//   A State Bar Council ENROLLMENT NUMBER is  STATE / SERIAL / YEAR
//     • STATE  = the state bar-council code  (Gujarat = "G")
//     • SERIAL = the actual bar code/number  (e.g. 702, 4732)
//     • YEAR   = the enrolment year          (REQUIRED by the eCourts bar search)
//   e.g. "G/702/2020", "G/4732/1999" (Gujarat), "MAH/1234/1982" (Maharashtra).
//   The SERIAL *is* the "eCourts bar code" — there is no separate third id. The old 3-box
//   form split this one identifier into three and was the source of the founder confusion.
//
//   ⚠️ A number like **11240 is NOT a bar SERIAL** — it is an *internal eCourts system code*
//   (the value that rides inline in `pet_adv` as "MR YASH J PATEL(11240)"). NEVER treat it as
//   the enrolment serial and NEVER search the roster by it. The founder-reported "Bar 11240 → 0
//   cases" was exactly this mistake: 11240 is an eCourts display number, not the person's
//   STATE/SERIAL/YEAR enrolment. Parse/store the three parts; the SERIAL is what eCourts wants.
//
//   • The AIBE / BCI certificate number is a *separate national* id — irrelevant to eCourts.
//     We never ask for it.
//
// This per-state map, filled across all states, is the spine for advocate onboarding + full-roster
// ("scrape their complete details") scraping everywhere — so keep the three parts distinct. The
// enrollment `STATE` letter the advocate writes (Gujarat = "G") is carried as `statePrefix` for
// parsing/council-inference; the search token (`barstatecode`) is carried separately — for Gujarat
// the two happen to coincide ("G"), but they are conceptually distinct.
//
// WHY VALID ADVOCATES GOT "0 CASES": the eCourts bar-code search
// (`searchByAdvocateName.php`, `checkedSearchByRadioValue:"2"`) REQUIRES four params —
// `barstatecode` = the single-letter Bar-Council code **"G"** for BOTH the High Court and
// the Gujarat district tier, `barcode` (the enrollment serial, e.g. 702 — NOT the inline HC
// advocate code 11240), **`year` (enrollment year)**, and numeric `state_code` (17).
// Two bugs stacked: onboarding never collected the year (WO-42, fixed), AND the tier tokens
// were "GJ"/"GJG" — both of which the eCourts backend answers with 0 cases. The 2026-07-05
// MITM capture proved "G" + serial 702 + year 2020 returns 386 HC / 22 district cases, while
// every GJ/GJG/GUJ variant and barcode 11240 returns 0 (BP-60; scraper `mobile_api.py`).
//   NB (founder probe, S-WO41ingest): even with the correct SERIAL + scope + warmed session the
//   live mobile search still returned 0 for some advocates tried — getting a live NON-EMPTY roster
//   is a SEPARATE open engineering step (scope/session/tier), not a format question. The format is
//   settled; the empty-state stays honest until live retrieval is broadly proven.
//
// This module is PURE (no I/O) so it is unit-tested offline. Token maps are SOURCED,
// never guessed: only councils whose tokens were packet-verified carry `verified:true`
// and drive a live eCourts roster fetch; the rest capture the enrollment + fall back to
// name search with an honest empty-state (unverified tokens tracked in exec/DATA-GAPS.md).

export interface ParsedBarNumber {
  stateBar: string; // the enrollment STATE code as entered, uppercased (Gujarat = "G"; also "MAH")
  serial: number; // the SERIAL = the actual bar code (e.g. 702, 4732) — NOT the eCourts internal number (11240)
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
// VERIFIED so far: Gujarat only — `barstatecode="G"` for BOTH tiers (HC and district),
// `state_code=17` (2026-07-05 MITM recon; `scraper/mobile_api.py:build_advocate_search_params`).
// The earlier WO-34 "GJ"/"GJG" tokens were WRONG — the eCourts backend returns 0 cases for
// them (BP-60). Each additional state's token must be packet-verified via the WO-43 MITM recon
// harness before flipping `verified` → true; the unverified backlog lives in `exec/DATA-GAPS.md`.
export const STATE_BAR_COUNCILS: StateBarCouncil[] = [
  // Gujarat: enrollment STATE prefix "G" (⭐ ruling) + `barstatecode="G"` for BOTH tiers — the
  // live-confirmed token (BP-60: "GJ"/"GJG" return 0 cases). Prefix and token coincide here.
  { id: "GJ", label: "Gujarat", statePrefix: "G", stateCode: 17, hcBarToken: "G", dcBarToken: "G", verified: true },
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
    // court_code_arr "1,5" = the courts in ONE Gujarat district complex — a partial probe, not
    // statewide district coverage. (The 2026-07-05 capture returned 22 cases for district 13 with
    // this complex; full district fan-out — the court worklist per district — is BP-57.)
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
