// WO-33 — classification cache reconstruction. Run: npx tsx tests/wo33_classification_cache.ts
import { classificationFromCache } from "../src/lib/docs/classification-cache";

let failed = 0;
function ok(name: string, cond: boolean) { console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`); if (!cond) failed++; }

const row = {
  doc_type: "notice",
  category: "notices",
  extracted: {
    parties: ["Rajesh Sharma"], dates: ["2026-06-24"], amounts: ["₹50,000"], cnrs: ["GJAH010000072025"],
    summary: "A demand notice.", confidence: 0.42, isLegal: true,
    suggestedClientName: "Rajesh Sharma", suggestedMatterTitle: "Sharma v. X",
    // fields that must NOT leak into the reconstruction:
    status: "filed", deletedAt: "2026-07-01",
  },
};
const c = classificationFromCache(row);

ok("reuses the extraction", c.doc_type === "notice" && c.summary === "A demand notice." && c.extracted.cnrs[0] === "GJAH010000072025");
ok("carries is_legal + confidence + suggestions", c.is_legal === true && c.confidence === 0.42 && c.suggested_client_name === "Rajesh Sharma");
ok("NULLS the stale match (re-decided per context)", c.client_id === null && c.matter_id === null);

// Robust to a missing/degenerate extracted blob.
const bare = classificationFromCache({ doc_type: null, category: null, extracted: null });
ok("defaults safely when extracted is empty", bare.doc_type === "other" && bare.is_legal === true && bare.extracted.parties.length === 0 && bare.confidence === 0.5);

// is_legal defaults true unless explicitly false.
ok("is_legal honours explicit false", classificationFromCache({ doc_type: "x", category: "y", extracted: { isLegal: false } }).is_legal === false);

console.log(failed === 0 ? "\nPASS" : `\nFAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
