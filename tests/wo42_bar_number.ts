// WO-42 · Advocate bar-enrolment parsing + State Bar Council token map.
// Pure/offline — no network, no .env. Run: npx tsx tests/wo42_bar_number.ts
//
// ⭐ Canonical format (founder-ruled 2026-07-05): STATE/SERIAL/YEAR, Gujarat STATE="G"
// (e.g. G/702/2020). A number like 11240 is an eCourts INTERNAL display code, NOT a bar
// serial — never search the roster by it. See exec/LEARNINGS.md ⭐.
import { readFileSync } from "node:fs";
import { parseBarNumber, stateBarCouncil, councilByStatePrefix, barSearchScopes, diagnoseEmptyRoster, STATE_BAR_COUNCILS } from "../src/lib/court/bar-number";

let failures = 0;
const check = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failures++; };

// ── parseBarNumber (canonical Gujarat form = G/SERIAL/YEAR) ───────────────────
const gj = parseBarNumber("G/702/2020");
check("parses STATE/SERIAL/YEAR", !!gj && gj.stateBar === "G" && gj.serial === 702 && gj.year === 2020);
check("canonical is normalized", gj?.canonical === "G/702/2020");
check("another real Gujarat form G/4732/1999", parseBarNumber("G/4732/1999")?.serial === 4732);
check("multi-letter state prefix (MAH)", parseBarNumber("MAH/1234/1982")?.stateBar === "MAH");
check("historical year", parseBarNumber("MAH/1234/1982")?.year === 1982);
check("dashes as separators", parseBarNumber("G-702-2020")?.serial === 702);
check("spaces as separators", parseBarNumber("G 702 2020")?.year === 2020);
check("lowercase is upcased", parseBarNumber("g/702/2020")?.stateBar === "G");
check("whitespace trimmed", parseBarNumber("  G/702/2020  ")?.serial === 702);
check("no-separator form disambiguates via 4-digit year", parseBarNumber("G7022020")?.year === 2020);

// Rejections — must NOT silently accept an under-specified id (the root-cause bug).
check("rejects missing year (just state+serial)", parseBarNumber("G/702") === null);
// 11240 is an eCourts internal display code, not a bar number — bare, it must NOT parse.
check("rejects a bare eCourts display code (11240)", parseBarNumber("11240") === null);
check("rejects empty", parseBarNumber("") === null);
check("rejects null", parseBarNumber(null) === null);
check("rejects garbage", parseBarNumber("not a bar number") === null);
check("rejects implausible year (1800)", parseBarNumber("G/702/1800") === null);

// ── State Bar Council map ─────────────────────────────────────────────────────
const gujarat = stateBarCouncil("GJ");
check("Gujarat is verified", !!gujarat && gujarat.verified === true);
check("Gujarat enrolment prefix = G (⭐ ruling)", gujarat?.statePrefix === "G");
// BP-60: capture-verified — barstatecode must be the single-letter "G" for BOTH tiers.
// "GJ"/"GJG" (the old WO-34 tokens) return 0 cases; regression-guard them here.
check("Gujarat HC token = G (not GJ)", gujarat?.hcBarToken === "G");
check("Gujarat district token = G (not GJG)", gujarat?.dcBarToken === "G");
check("neither Gujarat token is the losing GJ/GJG", gujarat?.hcBarToken !== "GJ" && gujarat?.dcBarToken !== "GJG");
check("Gujarat state_code = 17", gujarat?.stateCode === 17);
check("lookup is case-insensitive", stateBarCouncil("gj")?.id === "GJ");
check("unknown council → null", stateBarCouncil("ZZ") === null);
check("exactly one verified council today (Gujarat)", STATE_BAR_COUNCILS.filter((c) => c.verified).length === 1);
check("no unverified council leaks a token (never guessed)", STATE_BAR_COUNCILS.every((c) => c.verified || (c.hcBarToken === null && c.dcBarToken === null && c.stateCode === null && c.statePrefix === null)));

// ── councilByStatePrefix (resolve from the enrolment letter, not the token id) ─
check("prefix 'G' → Gujarat (the letter the advocate writes)", councilByStatePrefix("G")?.id === "GJ");
check("prefix lookup is case-insensitive", councilByStatePrefix("g")?.id === "GJ");
check("token id 'GJ' is NOT a state prefix (won't false-match)", councilByStatePrefix("GJ") === null);
check("unsourced prefix → null (no guess)", councilByStatePrefix("MH") === null);
check("empty prefix → null", councilByStatePrefix("") === null);

// ── barSearchScopes ───────────────────────────────────────────────────────────
const scopes = barSearchScopes(gujarat!);
check("verified council → 2 scopes (HC + district)", scopes.length === 2);
check("HC scope first, uses court_code", scopes[0].tier === "HC" && scopes[0].barState === "G" && scopes[0].courtCode === 1 && scopes[0].courtCodeArr === undefined);
check("district scope uses court_code_arr", scopes[1].tier === "DC" && scopes[1].barState === "G" && scopes[1].courtCodeArr === "1,5");
check("both live scopes send barstatecode=G", scopes.every((s) => s.barState === "G"));
check("every scope carries numeric state_code", scopes.every((s) => s.stateCode === 17));
check("unverified council → no live scopes", barSearchScopes(stateBarCouncil("MH")!).length === 0);

// ── diagnoseEmptyRoster (honest empty-state) ─────────────────────────────────
check("bare display code → 'unparsed'", diagnoseEmptyRoster("11240", "GJ").kind === "unparsed");
check("valid enrolment, unverified council → 'unverified'", diagnoseEmptyRoster("MAH/1234/1982", "MH").kind === "unverified");
const unv = diagnoseEmptyRoster("MAH/1234/1982", "MH");
check("unverified names the council", unv.kind === "unverified" && unv.council === "Maharashtra & Goa");
check("valid enrolment + verified council → 'no-results'", diagnoseEmptyRoster("G/702/2020", "GJ").kind === "no-results");
check("council inferred from enrolment PREFIX 'G' when token absent", diagnoseEmptyRoster("G/702/2020", null).kind === "no-results");

// ── WO-48 copy-regression guard ───────────────────────────────────────────────
// The onboarding placeholder/hint/toast has drifted back to `GUJ/11240/2025` more than once
// (11240 = an eCourts display code that returns 0 cases — the founder-reported bug). Fail CI if
// a user-facing bar EXAMPLE ever regresses to it, so the ⭐ ruling can't be undone by a copy edit.
for (const f of ["en.json", "hi.json"]) {
  const txt = readFileSync(new URL(`../src/i18n/messages/${f}`, import.meta.url), "utf8");
  check(`${f}: bar examples use the canonical G/702/2020`, txt.includes("G/702/2020"));
  check(`${f}: no stale 11240 example (⭐ ruling: 11240 is not a serial)`, !txt.includes("11240"));
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
