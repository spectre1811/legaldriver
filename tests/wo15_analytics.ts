// WO-15 — product-analytics PII-guard + taxonomy. Run: npx tsx tests/wo15_analytics.ts
// The whole privacy case for shipping analytics on a legal app rests on `safeProps`: it must keep
// only whitelisted, non-PII props. These assert that chokepoint holds.
import { safeProps, ALLOWED_PROPS, sizeBucket, type AnalyticsEvent } from "../src/lib/analytics/events";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed++;
}

// 1) Whitelist: only declared keys survive; unknown keys are dropped.
const p1 = safeProps("case_added", { source: "legaldriver", isNew: "true", cnr: "GJAH010000072025", secret: "x" });
ok("keeps whitelisted keys", p1.source === "legaldriver" && p1.isNew === "true");
ok("drops non-whitelisted key 'cnr'", !("cnr" in p1));
ok("drops non-whitelisted key 'secret'", !("secret" in p1));

// 2) CNR-shaped values are dropped even if the KEY is whitelisted (defense-in-depth).
const p2 = safeProps("search_performed", { kind: "GJAH010000072025" });
ok("drops a CNR-shaped value on a whitelisted key", !("kind" in p2));
const p3 = safeProps("search_performed", { kind: "party" });
ok("keeps a safe value on the same key", p3.kind === "party");

// 3) Events with no allowed props never emit props (e.g. a name accidentally passed).
const p4 = safeProps("signup", { email: "a@b.com" } as Record<string, unknown>);
ok("event with empty prop-list emits nothing", Object.keys(p4).length === 0);

// 4) Every event in the taxonomy has a prop whitelist (a defined array).
ok("taxonomy is well-formed", (Object.keys(ALLOWED_PROPS) as AnalyticsEvent[]).every((e) => Array.isArray(ALLOWED_PROPS[e])));

// 5) sizeBucket never leaks an exact count.
ok("sizeBucket buckets", sizeBucket(0) === "0" && sizeBucket(3) === "1-5" && sizeBucket(12) === "6-20" && sizeBucket(99) === "20+");

// 6) Oversized values are truncated (no essay smuggled through a safe key).
const long = "a".repeat(200);
ok("truncates oversized values to <= 64", safeProps("draft_generated", { kind: long }).kind.length === 64);

console.log(failed === 0 ? "\nPASS" : `\nFAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
