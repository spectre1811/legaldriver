// WO-27 — filing-decision guardrail. Run: npx tsx tests/wo27_filing_decision.ts
// The product-depth rule "auto-file = suggest, don't force" lives in decideFiling: an explicit
// context wins; a weak hub match goes to review, never to the wrong matter.
import { decideFiling } from "../src/lib/docs/filing-decision";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed++;
}

// 1) Explicit case context ALWAYS wins — even if the classifier disagrees / is unsure.
const a = decideFiling({ confidence: 0.1, client_id: "other", matter_id: "other" }, { matterId: "M1" });
ok("explicit matter context wins + files", a.matterId === "M1" && a.status === "filed");

// 2) Explicit client context wins.
const b = decideFiling({ confidence: 0.9, client_id: "cX", matter_id: "mX" }, { clientId: "C1" });
ok("explicit client context wins", b.clientId === "C1" && b.status === "filed");

// 3) Hub upload, concrete existing match → auto-files to it.
const c = decideFiling({ confidence: 0.9, client_id: "C9", matter_id: "M9" });
ok("concrete match auto-files", c.clientId === "C9" && c.matterId === "M9" && c.status === "filed");

// 4) STRUCTURAL: a concrete match files even at LOW self-confidence — a real record match is
//    trustworthy; the model's confidence number is not (research §5).
const d = decideFiling({ confidence: 0.2, client_id: "C9", matter_id: null });
ok("low self-confidence but a real match → filed", d.clientId === "C9" && d.status === "filed");

// 5) HIGH self-confidence but NO concrete match → needs_review (don't trust the number, no wrong file).
const e = decideFiling({ confidence: 0.99, client_id: null, matter_id: null });
ok("high self-confidence but no match → needs_review, unlinked", e.status === "needs_review" && e.clientId === null && e.matterId === null);

console.log(failed === 0 ? "\nPASS" : `\nFAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
