// WO-42 · Advocate bar-enrolment parsing + State Bar Council token map.
// Pure/offline — no network, no .env. Run: npx tsx tests/wo42_bar_number.ts
import { parseBarNumber, stateBarCouncil, barSearchScopes, diagnoseEmptyRoster, STATE_BAR_COUNCILS } from "../src/lib/court/bar-number";

let failures = 0;
const check = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failures++; };

// ── parseBarNumber ───────────────────────────────────────────────────────────
const gj = parseBarNumber("GUJ/11240/2025");
check("parses STATE/SERIAL/YEAR", !!gj && gj.stateBar === "GUJ" && gj.serial === 11240 && gj.year === 2025);
check("canonical is normalized", gj?.canonical === "GUJ/11240/2025");
check("single-letter state prefix (district form)", parseBarNumber("G/702/2020")?.serial === 702);
check("historical year", parseBarNumber("MAH/1234/1982")?.year === 1982);
check("dashes as separators", parseBarNumber("GJ-11240-2025")?.serial === 11240);
check("spaces as separators", parseBarNumber("GUJ 11240 2025")?.year === 2025);
check("lowercase is upcased", parseBarNumber("guj/11240/2025")?.stateBar === "GUJ");
check("whitespace trimmed", parseBarNumber("  GUJ/11240/2025  ")?.serial === 11240);
check("no-separator form disambiguates via 4-digit year", parseBarNumber("GUJ112402025")?.year === 2025);

// Rejections — must NOT silently accept an under-specified id (the root-cause bug).
check("rejects missing year (just state+serial)", parseBarNumber("GUJ/11240") === null);
check("rejects bare serial", parseBarNumber("11240") === null);
check("rejects empty", parseBarNumber("") === null);
check("rejects null", parseBarNumber(null) === null);
check("rejects garbage", parseBarNumber("not a bar number") === null);
check("rejects implausible year (1800)", parseBarNumber("GUJ/11240/1800") === null);

// ── State Bar Council map ─────────────────────────────────────────────────────
const gujarat = stateBarCouncil("GJ");
check("Gujarat is verified", !!gujarat && gujarat.verified === true);
// BP-60: capture-verified — barstatecode must be the single-letter "G" for BOTH tiers.
// "GJ"/"GJG" (the old WO-34 tokens) return 0 cases; regression-guard them here.
check("Gujarat HC token = G (not GJ)", gujarat?.hcBarToken === "G");
check("Gujarat district token = G (not GJG)", gujarat?.dcBarToken === "G");
check("neither Gujarat token is the losing GJ/GJG", gujarat?.hcBarToken !== "GJ" && gujarat?.dcBarToken !== "GJG");
check("Gujarat state_code = 17", gujarat?.stateCode === 17);
check("lookup is case-insensitive", stateBarCouncil("gj")?.id === "GJ");
check("unknown council → null", stateBarCouncil("ZZ") === null);
check("exactly one verified council today (Gujarat)", STATE_BAR_COUNCILS.filter((c) => c.verified).length === 1);
check("no unverified council leaks a token (never guessed)", STATE_BAR_COUNCILS.every((c) => c.verified || (c.hcBarToken === null && c.dcBarToken === null && c.stateCode === null)));

// ── barSearchScopes ───────────────────────────────────────────────────────────
const scopes = barSearchScopes(gujarat!);
check("verified council → 2 scopes (HC + district)", scopes.length === 2);
check("HC scope first, uses court_code", scopes[0].tier === "HC" && scopes[0].barState === "G" && scopes[0].courtCode === 1 && scopes[0].courtCodeArr === undefined);
check("district scope uses court_code_arr", scopes[1].tier === "DC" && scopes[1].barState === "G" && scopes[1].courtCodeArr === "1,5");
check("both live scopes send barstatecode=G", scopes.every((s) => s.barState === "G"));
check("every scope carries numeric state_code", scopes.every((s) => s.stateCode === 17));
check("unverified council → no live scopes", barSearchScopes(stateBarCouncil("MH")!).length === 0);

// ── diagnoseEmptyRoster (honest empty-state) ─────────────────────────────────
check("unparsed enrolment → 'unparsed'", diagnoseEmptyRoster("11240", "GJ").kind === "unparsed");
check("valid enrolment, unverified council → 'unverified'", diagnoseEmptyRoster("MAH/1234/1982", "MH").kind === "unverified");
const unv = diagnoseEmptyRoster("MAH/1234/1982", "MH");
check("unverified names the council", unv.kind === "unverified" && unv.council === "Maharashtra & Goa");
check("valid enrolment + verified council → 'no-results'", diagnoseEmptyRoster("GUJ/11240/2025", "GJ").kind === "no-results");
check("council inferred from enrolment prefix when token absent", diagnoseEmptyRoster("GJ/11240/2025", null).kind === "no-results");

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
