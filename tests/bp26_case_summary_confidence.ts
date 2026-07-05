// BP-26 — AI case-summary confidence + low-confidence review routing.
// Run: npx tsx tests/bp26_case_summary_confidence.ts
import {
  CASE_SUMMARY_SCHEMA,
  CASE_SUMMARY_REVIEW_THRESHOLD,
  confidenceBand,
  normalizeCaseSummary,
  FALLBACK,
} from "../src/lib/docs/case-summary";

let failed = 0;
function ok(name: string, cond: boolean) { console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`); if (!cond) failed++; }

// A minimal valid raw model output, parameterised by confidence.
const raw = (confidence: unknown) => ({ summary: "A §138 NI Act complaint.", posture: "At evidence.", confidence });

// --- schema advertises confidence and requires it ---
ok("schema has confidence property", "confidence" in (CASE_SUMMARY_SCHEMA.properties as Record<string, unknown>));
ok("confidence is required", (CASE_SUMMARY_SCHEMA.required as readonly string[]).includes("confidence"));

// --- band buckets (low is exactly the review band) ---
ok("band high >= 0.8", confidenceBand(0.8) === "high" && confidenceBand(0.95) === "high");
ok("band medium in [0.6,0.8)", confidenceBand(0.6) === "medium" && confidenceBand(0.79) === "medium");
ok("band low < 0.6", confidenceBand(0.59) === "low" && confidenceBand(0) === "low");
ok("threshold is 0.6", CASE_SUMMARY_REVIEW_THRESHOLD === 0.6);

// --- normalize: parse + clamp + review verdict ---
const high = normalizeCaseSummary(raw(0.9))!;
ok("high confidence parsed", high.confidence === 0.9);
ok("high confidence not flagged for review", high.review === false);

const low = normalizeCaseSummary(raw(0.3))!;
ok("low confidence parsed", low.confidence === 0.3);
ok("low confidence flagged for review", low.review === true);

ok("confidence clamped above 1", normalizeCaseSummary(raw(1.5))!.confidence === 1);
ok("confidence clamped below 0", normalizeCaseSummary(raw(-2))!.confidence === 0);

// --- missing / non-numeric confidence is conservatively routed to review (never shown as certain) ---
const missing = normalizeCaseSummary({ summary: "Thin record." })!;
ok("missing confidence defaults below threshold", missing.confidence < CASE_SUMMARY_REVIEW_THRESHOLD);
ok("missing confidence => review", missing.review === true);
ok("NaN-ish confidence => review", normalizeCaseSummary(raw("high"))!.review === true);

// --- an unparseable object is still rejected (unchanged contract) ---
ok("no summary => null", normalizeCaseSummary({ confidence: 0.9 }) === null);

// --- FALLBACK is a review-state zero ---
ok("FALLBACK confidence 0", FALLBACK.confidence === 0);
ok("FALLBACK is review", FALLBACK.review === true);

console.log(failed === 0 ? "\nPASS" : `\nFAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
