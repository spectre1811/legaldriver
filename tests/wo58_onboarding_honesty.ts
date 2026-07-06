// WO-58 · Advocate onboarding was a "blackhole": for an advocate we don't already hold, the fetch
// returned [] and every failure was silently swallowed, so the user got 0 cases with NO explanation
// (and, when LD_API_KEY is unset in an env, a MISLEADING "no cases for this enrolment" that implies the
// advocate has none). This locks the anti-blackhole contract of the court layer:
//   1. no source configured → `enabledAdvocateProviders()` is empty (drives the honest "not configured"
//      message, distinct from "we searched and you have none");
//   2. `fetchAdvocateCasesWithMeta` returns the merged cases + which providers ran + per-provider ERRORS
//      (captured, never `.catch(()=>[])`'d into a blank zero);
//   3. `startLiveAdvocateRefresh` is the ONLY thing that fires the async live roster refresh — gated on
//      LD_API_KEY + a parsed enrolment + a verified council — and posts the full eCourts tuple per scope.
// Run: npx tsx tests/wo58_onboarding_honesty.ts
import { enabledAdvocateProviders, fetchAdvocateCasesWithMeta, startLiveAdvocateRefresh } from "../src/lib/court/advocate-cases";

let failures = 0;
const check = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failures++; };

async function main() {
// Ensure a clean, keyless env for the "not configured" assertions.
for (const k of ["LD_API_KEY", "INDIANKANOON_API_KEY", "VAKEEL360_API_KEY", "CORPUS_AWS_ACCESS_KEY_ID", "CORPUS_AWS_SECRET_ACCESS_KEY", "ATHENA_OUTPUT"]) delete process.env[k];

// (1) No source configured → empty provider list. This is what makes the "not configured" (actionable)
// message fire instead of a misleading "this advocate has no cases".
check("no env → enabledAdvocateProviders() is empty", enabledAdvocateProviders().length === 0);

// (2) Meta shape is honest even with nothing configured — never throws, no fabricated cases.
const metaNone = await fetchAdvocateCasesWithMeta({ name: "Some Advocate", barNumber: "G/702/2020", stateCode: "GJ", live: true });
check("no providers → { cases:[], providers:[], errors:[] }",
  metaNone.cases.length === 0 && metaNone.providers.length === 0 && metaNone.errors.length === 0);

// Guard: too-short a name never fans out (avoids matching every "A. …" namesake).
const metaShort = await fetchAdvocateCasesWithMeta({ name: "ab" });
check("name < 3 chars → no cases", metaShort.cases.length === 0);

// (3) startLiveAdvocateRefresh — the async fire-and-forget gate.
check("no LD_API_KEY → live refresh NOT fired (returns false)",
  startLiveAdvocateRefresh({ name: "X Advocate", barNumber: "G/702/2020", stateCode: "GJ", live: true }) === false);

// With a key set, stub fetch so NOTHING hits the network; assert the dispatch + the exact param tuple.
const calls: { url: string; method?: string }[] = [];
const realFetch = globalThis.fetch;
// Minimal stub — we only inspect the request, never use the Response (cast keeps it type-clean).
globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
  calls.push({ url: String(url), method: init?.method });
  return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
}) as typeof fetch;
try {
  process.env.LD_API_KEY = "ld_test_key";
  process.env.LD_API_BASE = "http://test-box:8080";

  // Unparseable bar (no STATE/YEAR) → cannot build the eCourts tuple → NOT fired.
  check("key set but unparseable bar → live refresh NOT fired",
    startLiveAdvocateRefresh({ name: "X", barNumber: "11240", stateCode: null, live: true }) === false);

  calls.length = 0;
  // Verified Gujarat council (via the "G" enrolment prefix) → fired, one POST per scope.
  const fired = startLiveAdvocateRefresh({ name: "M H Solanki", barNumber: "G/702/2020", stateCode: null, live: true });
  check("key + parsed enrolment + verified council → live refresh fired (returns true)", fired === true);
  check("dispatched at least one scope POST to /advocate/{serial}/refresh",
    calls.length >= 1 && calls.every((c) => /\/advocate\/702\/refresh\?/.test(c.url)) && calls.every((c) => c.method === "POST"));
  check("each POST carries the FULL eCourts tuple (year + bar_state=G + state_code + tier)",
    calls.every((c) => /year=2020/.test(c.url) && /bar_state=G(&|$)/.test(c.url) && /state_code=\d+/.test(c.url) && /tier=/.test(c.url)));
  check("never sends the bare serial as the bar id, never bar_state=GJ (BP-60 rule)",
    calls.every((c) => !/bar_state=GJ/.test(c.url)));
} finally {
  globalThis.fetch = realFetch;
}
}

main().then(() => {
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
});
