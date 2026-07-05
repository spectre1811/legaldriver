// BP-57 · Data-driven barSearchScopes over the platform court-scope registry.
// Pure/offline — no network, no .env. Run: npx tsx tests/bp57_advocate_scopes.ts
//
// Proves the district-scope UNBLOCK (BP-68-P1): barSearchScopes no longer hardcodes ONE district
// complex — it reads the generated ADVOCATE_SCOPES (from GET /v1/advocate-scopes) and ZIPS each
// geographic scope with the council's search token. As the platform registry's masters walk widens
// coverage (BP-57 W2), this function widens with zero code change. It must (a) stay honest when the
// registry is empty for a state (HC-only, never a guessed district) and (b) never drop the token side.
import { barSearchScopes, stateBarCouncil, type StateBarCouncil, type BarSearchScope } from "../src/lib/court/bar-number";
import { ADVOCATE_SCOPES, ADVOCATE_SCOPES_COVERAGE } from "../src/lib/court/advocate-scopes.data";

let failures = 0;
const check = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failures++; };

// ── the generated registry is present + shaped ──────────────────────────────────
const gjRows = ADVOCATE_SCOPES[17] ?? [];
check("ADVOCATE_SCOPES has Gujarat (state_code 17)", gjRows.length >= 1);
check("Gujarat registry leads with the HC scope", gjRows[0]?.tier === "HC");
check("Gujarat registry carries at least one DC complex", gjRows.some((r) => r.tier === "DC" && !!r.courtCodeArr));
check("coverage label is exposed for honest empty-state", typeof ADVOCATE_SCOPES_COVERAGE[17] === "string");

// ── barSearchScopes ZIPS registry geography with the council token (data-driven) ─
const gujarat = stateBarCouncil("GJ")!;
const scopes = barSearchScopes(gujarat);
check("verified council → one scope per registry row", scopes.length === gjRows.length);
check("HC scope: token zipped in, uses court_code (no court_code_arr)",
  scopes[0].tier === "HC" && scopes[0].barState === "G" && scopes[0].courtCode === 1 && scopes[0].courtCodeArr === undefined);
const dc = scopes.find((s) => s.tier === "DC")!;
const dcRow = gjRows.find((r) => r.tier === "DC")!;
check("DC scope: court_code_arr comes FROM the registry, not a literal", dc.courtCodeArr === dcRow.courtCodeArr);
check("DC scope carries the district token + numeric state_code", dc.barState === "G" && dc.stateCode === 17);
check("every scope sends barstatecode=G and state_code=17", scopes.every((s) => s.barState === "G" && s.stateCode === 17));

// ── honest fallbacks (info-integrity) ───────────────────────────────────────────
// A verified council whose state_code isn't in the registry yet → HC-only, never a guessed district.
const unregistered: StateBarCouncil = { id: "XX", label: "Test", statePrefix: "X", stateCode: 999, hcBarToken: "X", dcBarToken: "X", verified: true };
const fb = barSearchScopes(unregistered);
check("registry-miss verified council → exactly one HC scope (safety fallback)", fb.length === 1 && fb[0].tier === "HC");
check("fallback never fabricates a district complex", fb.every((s) => s.courtCodeArr === undefined));

// A verified council with an HC token but NO district token → only HC scopes (DC rows dropped).
const hcOnlyCouncil: StateBarCouncil = { id: "YY", label: "HC-only", statePrefix: "Y", stateCode: 17, hcBarToken: "G", dcBarToken: null, verified: true };
check("no dcBarToken → district rows are skipped (token side never dropped)",
  barSearchScopes(hcOnlyCouncil).every((s: BarSearchScope) => s.tier === "HC"));

// Unverified / unsourced councils never reach live.
check("unverified council → no live scopes", barSearchScopes(stateBarCouncil("MH")!).length === 0);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
