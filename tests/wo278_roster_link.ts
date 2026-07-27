// WO-278 · Cold-advocate onboarding stalled at "Paused / 0 cases on file" while the fleet had already
// ingested the full roster — because the enrolment→CNR gold-link is written server-side ONLY when
// `GET /advocate/refresh/{job}` is polled (`roster_job_status` → `link_roster_cnrs`), and onboarding's
// harvest only ever READ the warehouse profile (`GET /advocate/{bar}`), never poking the link endpoint.
// `linkIngestedRoster` is the poke the harvest now fires so a cold advocate's roster is attributed
// without a manual re-run. This locks its contract:
//   1. dispatched ONLY when a real refresh could have fired (LD_API_KEY + parsed enrolment + verified
//      council) — else there's nothing to link;
//   2. GETs `/advocate/refresh/{jobId}` with the canonical job id passed RAW (slashes, not %2F) so the
//      box's `{job_id:path}` route captures the segments;
//   3. carries the X-API-Key header (keyed /v1 surface).
// Run: npx tsx tests/wo278_roster_link.ts
import { linkIngestedRoster } from "../src/lib/court/advocate-cases";

let failures = 0;
const check = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failures++; };

type Call = { url: string; method?: string; key?: string };

async function main() {
  for (const k of ["LD_API_KEY", "LD_API_BASE"]) delete process.env[k];

  // (1) No LD_API_KEY → nothing dispatched (no box to poke).
  check("no LD_API_KEY → not dispatched (returns false)",
    (await linkIngestedRoster({ name: "Sidharth", barNumber: "G/384/2020", stateCode: "GJ" })) === false);

  const calls: Call[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    const h = new Headers(init?.headers);
    calls.push({ url: String(url), method: init?.method, key: h.get("X-API-Key") ?? undefined });
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
  }) as typeof fetch;
  try {
    process.env.LD_API_KEY = "ld_test_key";
    process.env.LD_API_BASE = "http://test-box:8080";

    // (2) Unparseable bar (bare display code, no STATE/YEAR) → no canonical job id → NOT dispatched.
    calls.length = 0;
    check("key set but unparseable bar → not dispatched",
      (await linkIngestedRoster({ name: "X", barNumber: "11240", stateCode: null })) === false && calls.length === 0);

    // (3) Unverified council (Maharashtra not live) → NOT dispatched — a name-only fallback never fired a
    // roster refresh, so there is no roster job to link.
    calls.length = 0;
    check("key set but unverified council → not dispatched",
      (await linkIngestedRoster({ name: "Y", barNumber: "MAH/1234/1982", stateCode: null })) === false && calls.length === 0);

    // (4) The real path — parsed Gujarat enrolment + verified council → dispatched.
    calls.length = 0;
    const fired = await linkIngestedRoster({ name: "Sidharth", barNumber: "G/384/2020", stateCode: "GJ" });
    check("key + parsed enrolment + verified council → dispatched (returns true)", fired === true);
    check("dispatched exactly one poke to the refresh/link endpoint", calls.length === 1);
    // The canonical job id must be RAW in the path (G/384/2020), never percent-encoded — the box route is
    // `{job_id:path}` and would 404 on `G%2F384%2F2020`. This is the exact bug that would silently no-op.
    check("pokes GET /advocate/refresh/G/384/2020 (job id RAW, not %2F)",
      calls.length === 1 && /\/advocate\/refresh\/G\/384\/2020$/.test(calls[0].url) && !/%2F/i.test(calls[0].url));
    check("carries the X-API-Key header", calls[0]?.key === "ld_test_key");
  } finally {
    globalThis.fetch = realFetch;
  }
}

main().then(() => {
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
});
