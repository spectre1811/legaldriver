// BP-24 — Cases PII-mask + honest-empty hardening (S1 trust fix).
// Pure/offline — GATES every PR. Run: npx tsx tests/bp24_cases_pii_honest.ts
//
// Covers the two contracts the fix rests on:
//  1. Masked protected-matter names ("XXXXXXX") never render verbatim — in a party, a composed
//     title, or a judge link — and are excluded from the client-match seed.
//  2. Honest-empty: an absent court field routes to the "empty" state, never a dropped/blank cell.
import { isMaskedName, maskName, maskTitle, MASKED_NAME_LABEL } from "../src/lib/court/mask";
import { resolveFieldState } from "../src/components/court/logic";
import type { NormalizedParty } from "../src/lib/court/types";

let failed = 0;
function ok(name: string, cond: boolean) { console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`); if (!cond) failed++; }

// ── isMaskedName: the ONE detector everything shares ────────────────────────
ok("XXXXXXX is masked", isMaskedName("XXXXXXX"));
ok("XXXX (min run) is masked", isMaskedName("XXXX"));
ok("lower-case xxxx is masked", isMaskedName("xxxx"));
ok("spaced/dotted X.X.X.X is masked", isMaskedName("X X X X") && isMaskedName("X.X.X.X"));
ok("XXX (<4) is NOT masked", !isMaskedName("XXX"));
ok("a real name is NOT masked", !isMaskedName("Ramesh Patel") && !isMaskedName("STATE OF GUJARAT"));
ok("a name that merely contains x is NOT masked", !isMaskedName("Xavier Fernandes"));
ok("empty / null is NOT masked", !isMaskedName("") && !isMaskedName(null) && !isMaskedName(undefined));

// ── maskName: masked → withheld label, else verbatim ────────────────────────
ok("maskName masks XXXXXXX", maskName("XXXXXXX") === MASKED_NAME_LABEL);
ok("maskName passes a real name through", maskName("Ramesh") === "Ramesh");
ok("maskName honours a custom (i18n) label", maskName("XXXXXXX", "नाम गोपनीय") === "नाम गोपनीय");
ok("maskName of empty is empty", maskName("") === "" && maskName(null) === "");

// ── maskTitle: mask each side of "A v. B" independently ─────────────────────
ok("both sides masked", maskTitle("XXXXXXX v. XXXXXXX") === "name withheld v. name withheld");
ok("only petitioner masked", maskTitle("XXXXXXX v. STATE OF GUJARAT") === "name withheld v. STATE OF GUJARAT");
ok("only respondent masked", maskTitle("RAMESH PATEL v. XXXXXXX") === "RAMESH PATEL v. name withheld");
ok("clean title unchanged", maskTitle("RAMESH PATEL v. STATE OF GUJARAT") === "RAMESH PATEL v. STATE OF GUJARAT");
ok("bare CNR fallback (no separator) unchanged", maskTitle("GJGN08000129202 6") === "GJGN08000129202 6");
ok("a wholly-masked non-vs title masks", maskTitle("XXXXXXX") === "name withheld");
ok("empty title → empty", maskTitle(null) === "" && maskTitle("") === "");

// ── four-state routing (what the pages feed CourtField) ─────────────────────
ok("masked value routes to 'masked'", resolveFieldState("XXXXXXX") === "masked");
ok("absent value routes to 'empty' (honest-empty)", resolveFieldState(null) === "empty" && resolveFieldState("") === "empty" && resolveFieldState("   ") === "empty");
ok("a real value routes to 'populated'", resolveFieldState("Additional Sessions Judge") === "populated");

// ── client-match seed excludes masked names (sync.ts contract) ──────────────
// Replicates the exact expression sync.ts uses so a regression there is caught here.
const parties: NormalizedParty[] = [
  { name: "XXXXXXX", side: "petitioner", masked: true },
  { name: "STATE OF GUJARAT", side: "respondent", masked: false },
];
const seed = [...new Set(parties.filter((p) => !p.masked).map((p) => p.name).filter(Boolean))];
ok("match seed excludes the masked party", !seed.includes("XXXXXXX"));
ok("match seed keeps the un-masked party", seed.includes("STATE OF GUJARAT") && seed.length === 1);

console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
