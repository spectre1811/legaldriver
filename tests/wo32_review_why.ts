// WO-32 — review "why" signal ordering. Run: npx tsx tests/wo32_review_why.ts
import { whyKey } from "../src/lib/docs/review-why";

let failed = 0;
function ok(name: string, cond: boolean) { console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`); if (!cond) failed++; }

// CNR is the strongest signal — wins even when the doc also came by email + names a party.
ok("CNR wins", whyKey({ cnrs: ["GJAH010000072025"], source: "gmail", parties: ["Sharma"] }) === "cnr");
ok("email when no CNR", whyKey({ cnrs: [], source: "gmail", parties: [] }) === "email");
ok("party when no CNR + not email", whyKey({ cnrs: [], source: "upload", parties: ["Sharma"] }) === "party");
ok("null when nothing", whyKey({ cnrs: [], source: "upload", parties: [] }) === null);

console.log(failed === 0 ? "\nPASS" : `\nFAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
