// WO-32 — code→full-name expansion (SOURCED, never guessed). Run: npx tsx tests/wo32_code_labels.ts
// Verifies expandCode over the real corpus vocabulary: self-labeled strings, the corpus-derived
// master, disposal parsing, advocate role-as-entity, and that unknown codes stay RAW (not faked).
import {
  expandCaseType, expandDisposal, advocateRole, cleanPurpose, smartTitleCase, expandCode,
} from "../src/lib/court/code-labels";
import { CASE_TYPE_MASTER, UNRESOLVED_CASE_TYPES } from "../src/lib/court/code-labels.data";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed++;
}
const eq = (name: string, got: unknown, want: unknown) =>
  ok(`${name} → ${JSON.stringify(got)}`, JSON.stringify(got) === JSON.stringify(want));

// ── case_type: self-describing strings expand from the datum itself ──
eq("district 'CC - CRIMINAL CASE'", expandCaseType("CC - CRIMINAL CASE", "DISTRICT"),
  { full: "Criminal Case", code: "CC", known: true });
eq("HC 'CR.A(CRIMINAL APPEAL)-43'", expandCaseType("CR.A(CRIMINAL APPEAL)-43", "HIGH"),
  { full: "Criminal Appeal", code: "CR.A", known: true });
// district full-name ending in "(...)" must NOT be mis-parsed by the HC paren pattern
eq("district 'RECO33C2-LC - Recovery 33C (2)'", expandCaseType("RECO33C2-LC - Recovery 33C (2)", "DISTRICT"),
  { full: "Recovery 33C (2)", code: "RECO33C2-LC", known: true });

// ── case_type: bare codes resolve via the corpus master ──
eq("bare 'CC' @DISTRICT", expandCaseType("CC", "DISTRICT").full, "Criminal Case");
eq("bare 'CC' @HIGH (tier-specific)", expandCaseType("CC", "HIGH").full, "Criminal Confirmation Case");
eq("bare 'RCS'", expandCaseType("RCS", "DISTRICT").full, "Regular Civil Suit");
eq("bare 'CR.MA' @HIGH (punct-normalized)", expandCaseType("CR.MA", "HIGH").full, "Criminal Misc.Application");
eq("bare 'CRMA-S' == 'CRMA S' (normalized)", expandCaseType("CRMA-S", "DISTRICT").full, expandCaseType("CRMA S", "DISTRICT").full);
ok("bare 'NDPS' keeps acronym", expandCaseType("NDPS", "DISTRICT").full.includes("NDPS"));

// ── case_type: unknown codes stay RAW + flagged (never fabricated) ──
for (const u of ["SMRY", "FSUIT", "ZZZQ"]) {
  const r = expandCaseType(u, "DISTRICT");
  eq(`unknown '${u}' stays raw`, { full: r.full, known: r.known }, { full: u, known: false });
}
ok("every UNRESOLVED code is genuinely absent from the master (no silent guess)", (() => {
  const norm = (c: string) => c.toUpperCase().replace(/[.\-\s]+/g, " ").trim();
  return UNRESOLVED_CASE_TYPES.every((u) => !CASE_TYPE_MASTER.ANY[norm(u.code)]);
})());

// ── disposal_nature: deterministic parse of the embedded description ──
eq("disposal 'Contested--56-DISPOSED AT ADMISSION STAGE'", expandDisposal("Contested--56-DISPOSED AT ADMISSION STAGE"),
  { full: "Contested — Disposed at Admission Stage", code: "56", contest: "Contested", known: true });
eq("disposal '--47-DISPOSAL IN ANY OTHER MODE FH' (no contest)", expandDisposal("--47-DISPOSAL IN ANY OTHER MODE FH").full,
  "Disposal in Any Other Mode FH");
eq("disposal 'Contested--DISPOSED AS INFRUCTUOUS' (no numeric code)", expandDisposal("Contested--DISPOSED AS INFRUCTUOUS").full,
  "Contested — Disposed as Infructuous");
eq("disposal plain 'DISPOSED'", expandDisposal("DISPOSED").full, "Disposed");

// ── advocate role-as-entity ──
eq("advocate 'APP' is a role", advocateRole("APP"), { isRole: true, full: "Additional Public Prosecutor", raw: "APP" });
eq("advocate 'app' (case-insensitive)", advocateRole("app").full, "Additional Public Prosecutor");
ok("advocate 'DGP' flagged role but NOT expanded (ambiguous)", advocateRole("DGP").isRole === true && !advocateRole("DGP").full);
ok("real advocate name is not a role", advocateRole("M H SOLANKI").isRole === false);
eq("expandCode advocateRole dispatch", expandCode("advocateRole", "PP"), { full: "Public Prosecutor", code: "PP", known: true, isRole: true });

// ── purpose: HTML-entity decode + tidy ──
eq("purpose decodes &amp; and &#039;", cleanPurpose("PETITIONER&#039;S  EVIDENCE"), "Petitioner’s Evidence");
ok("purpose keeps numeric prefix", cleanPurpose("192-NOTICE &amp; ADJOURNED MATTERS").includes("192-"));

// ── smartTitleCase over EVERY real corpus value: no acronym mangled into a fake word ──
const BAD = /\b(Ndps|Pmla|Pcso|Cbi|Esi|Rera|Jmfc|Gctoc|Glgp|Gpid)\b/;
let mangled = 0;
for (const tier of ["HIGH", "DISTRICT"] as const) {
  for (const full of Object.values(CASE_TYPE_MASTER[tier])) {
    if (BAD.test(smartTitleCase(full))) { console.log(`   mangled: ${full} → ${smartTitleCase(full)}`); mangled++; }
  }
}
ok("no known acronym is title-cased into a fake word", mangled === 0);

console.log(failed === 0 ? "\nPASS" : `\nFAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
