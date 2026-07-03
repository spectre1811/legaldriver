// WO-33 W2 — fuzzy party↔client/case name matching. Run: npx tsx tests/wo33_name_match.ts
import { similarity, normalizeName, bestMatch } from "../src/lib/docs/name-match";

let failed = 0;
function ok(name: string, cond: boolean) { console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`); if (!cond) failed++; }

// Normalization strips legal-entity noise so variants collapse.
ok("normalizes entity noise", normalizeName("M/s Sharma & Co. Pvt Ltd") === "sharma");

// Similarity: same name ~1, close variants high, unrelated low.
ok("identical ~1", similarity("Rajesh Sharma", "Rajesh Sharma") > 0.99);
ok("variant high", similarity("M/s Sharma & Co.", "Sharma and Company") > 0.5);
ok("unrelated low", similarity("Rajesh Sharma", "Manappuram Finance") < 0.3);

// bestMatch picks the right client above threshold, else null.
const clients = [
  { id: "c1", name: "Rajesh Sharma" },
  { id: "c2", name: "Manappuram Finance Limited" },
];
ok("matches the right client from a party", bestMatch(["Rajesh Kumar Sharma"], clients, 0.4) === "c1");
ok("no match below threshold → null", bestMatch(["Totally Unrelated Person"], clients, 0.55) === null);
ok("ignores too-short queries", bestMatch(["ab"], clients, 0.1) === null);

console.log(failed === 0 ? "\nPASS" : `\nFAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
