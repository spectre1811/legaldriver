// Regression: a 500/timeout from the LD API must NOT render as "page not found".
// ldGet used to collapse EVERY failure to null → the advocate/judge pages called notFound() —
// seen live 2026-07-24: a cold heavy-roster profile (G/2447/2012, 7.5k cases) hit the API's read
// statement cap → 500 → phantom 404. Strict mode: only a real HTTP 404 is null; 5xx/network/timeout
// throw so the dashboard error boundary renders retry. Search helpers keep degrade-to-null.
// Run: npx tsx tests/profile_error_states.ts
import { getAdvocateProfile, getJudge, searchAdvocates } from "../src/lib/court/legaldriver-api";

process.env.LD_API_KEY = "test-key";
process.env.LD_API_BASE = "http://ld-stub.invalid";

let failures = 0;
const check = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failures++; };

const respond = (status: number, body: unknown = {}) => {
  globalThis.fetch = (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
};
const networkFail = () => {
  globalThis.fetch = (async () => { throw new Error("socket hang up"); }) as typeof fetch;
};
const threw = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };

(async () => {
  respond(404);
  check("profile 404 → null (notFound is correct)", (await getAdvocateProfile("G/2447/2012")) === null);

  respond(500);
  check("profile 500 → throws (error boundary, not 404)", await threw(() => getAdvocateProfile("G/2447/2012")));
  check("judge 500 → throws", await threw(() => getJudge("123")));

  networkFail();
  check("profile network/timeout failure → throws", await threw(() => getAdvocateProfile("G/2447/2012")));

  respond(200, { bar_id: "G/2447/2012", names: ["P R PATEL"], case_count: 1, cases: [] });
  const p = await getAdvocateProfile("G/2447/2012");
  check("profile 200 → parsed payload", p?.bar_id === "G/2447/2012");

  respond(500);
  check("search 500 → degrades to [] (no throw)", (await searchAdvocates("patel")).length === 0);

  if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
  console.log("\nAll profile_error_states checks passed.");
})();
