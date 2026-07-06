// WO-64 · LD-API auth was a silent single point of failure: a rotted `LD_API_KEY` returned 401 → 0
// cases for every advocate, and (a) nothing monitored it and (b) the app rendered the 401 as the
// reassuring "still fetching…". This locks the HONESTY + CANARY contract that closes that hole:
//   1. classifyHttpStatus — 401/403 → "auth", 5xx → "source_down", 2xx/404 → not-an-error (empty is valid).
//   2. the LD provider THROWS a classified ProviderError on 401/5xx (not a silent []), so
//      fetchAdvocateCasesWithMeta records WHY the fetch was empty.
//   3. onboardingFetchNote — an auth failure reads "authentication failed — an admin must fix the key",
//      NEVER "still fetching…"; source-down reads "temporarily unavailable"; only a healthy in-flight
//      refresh says "still fetching".
//   4. evaluateCanary — the synthetic probe alarms on 401 / 5xx / unreachable / authed-but-empty.
// Run: npx tsx tests/wo64_auth_honesty.ts
import {
  classifyHttpStatus, fetchAdvocateCasesWithMeta, onboardingFetchNote, FETCH_NOTE, ProviderError,
} from "../src/lib/court/advocate-cases";
import { evaluateCanary, caseCountFromPayload } from "../src/lib/court/ld-api-canary";

let failures = 0;
const check = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failures++; };

// A Response-ish stub for a given status/body — enough for the provider's `get` helper (ok + status + json).
function stubResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

async function main() {
  // Keyless for the corpus/IK/vakeel providers so ONLY the legaldriver provider fans out.
  for (const k of ["INDIANKANOON_API_KEY", "VAKEEL360_API_KEY", "CORPUS_AWS_ACCESS_KEY_ID", "CORPUS_AWS_SECRET_ACCESS_KEY", "ATHENA_OUTPUT"]) delete process.env[k];

  // ── (1) classifyHttpStatus — the pure kernel ──────────────────────────────
  check("classify 401 → auth", classifyHttpStatus(401) === "auth");
  check("classify 403 → auth", classifyHttpStatus(403) === "auth");
  check("classify 500 → source_down", classifyHttpStatus(500) === "source_down");
  check("classify 503 → source_down", classifyHttpStatus(503) === "source_down");
  check("classify 404 → null (valid empty, not a failure)", classifyHttpStatus(404) === null);
  check("classify 200 → null", classifyHttpStatus(200) === null);

  // ── (2) provider threads the status → classified ProviderError, captured in meta.errors ──
  const realFetch = globalThis.fetch;
  try {
    process.env.LD_API_KEY = "ld_test_key";
    process.env.LD_API_BASE = "http://test-box:8080";
    const q = { name: "M H Solanki", barNumber: "G/702/2020", stateCode: "GJ", live: true };

    // 401 → auth error recorded, zero cases (NOT a silent empty).
    globalThis.fetch = (async () => stubResponse(401, { error: "unauthorized" })) as typeof fetch;
    const m401 = await fetchAdvocateCasesWithMeta(q);
    check("401 → cases empty", m401.cases.length === 0);
    check("401 → an error is RECORDED (not swallowed)", m401.errors.length === 1);
    check("401 → error kind = auth", m401.errors[0]?.kind === "auth");

    // 500 → source_down.
    globalThis.fetch = (async () => stubResponse(500, {})) as typeof fetch;
    const m500 = await fetchAdvocateCasesWithMeta(q);
    check("500 → error kind = source_down", m500.errors[0]?.kind === "source_down");

    // Network throw → source_down (box unreachable), still a recorded error not a silent zero.
    globalThis.fetch = (async () => { throw new Error("ECONNREFUSED"); }) as typeof fetch;
    const mNet = await fetchAdvocateCasesWithMeta(q);
    check("network error → error kind = source_down", mNet.errors[0]?.kind === "source_down");

    // 404 → valid empty: NO error recorded (advocate simply absent from the warehouse).
    globalThis.fetch = (async () => stubResponse(404, {})) as typeof fetch;
    const m404 = await fetchAdvocateCasesWithMeta(q);
    check("404 → no error (valid empty answer)", m404.errors.length === 0 && m404.cases.length === 0);

    // 200 with cases → cases returned, no error.
    globalThis.fetch = (async () => stubResponse(200, { cases: [{ cnr: "GJHC010000012020", status: "PENDING" }] })) as typeof fetch;
    const m200 = await fetchAdvocateCasesWithMeta(q);
    check("200 with cases → 1 case, no error", m200.cases.length === 1 && m200.errors.length === 0);
  } finally {
    globalThis.fetch = realFetch;
  }

  // ── (3) onboardingFetchNote — the honest copy selector ─────────────────────
  check("no providers → notConfigured",
    onboardingFetchNote({ providersConfigured: false, casesFetched: 0, livePending: false, errors: [] }) === FETCH_NOTE.notConfigured);
  check("AUTH error → authFailed (never 'still fetching')",
    onboardingFetchNote({ providersConfigured: true, casesFetched: 0, livePending: false, errors: [{ source: "legaldriver", kind: "auth" }] }) === FETCH_NOTE.authFailed);
  check("auth beats a live-pending flag (no 'still fetching' for a 401)",
    onboardingFetchNote({ providersConfigured: true, casesFetched: 0, livePending: true, errors: [{ source: "legaldriver", kind: "auth" }] }) === FETCH_NOTE.authFailed);
  check("source_down → sourceDown",
    onboardingFetchNote({ providersConfigured: true, casesFetched: 0, livePending: false, errors: [{ source: "legaldriver", kind: "source_down" }] }) === FETCH_NOTE.sourceDown);
  check("healthy + live pending + 0 cases → fetching",
    onboardingFetchNote({ providersConfigured: true, casesFetched: 0, livePending: true, errors: [] }) === FETCH_NOTE.fetching);
  check("cases arrived → no note",
    onboardingFetchNote({ providersConfigured: true, casesFetched: 5, livePending: true, errors: [] }) === null);
  {
    const note = onboardingFetchNote({ providersConfigured: true, casesFetched: 0, livePending: false, errors: [{ source: "indiankanoon", kind: "unknown" }] });
    check("unknown error → names the source", !!note && note.includes("indiankanoon"));
  }

  // ── (4) evaluateCanary — the synthetic-probe alarm logic ───────────────────
  check("canary 401 → ALARM (auth)", evaluateCanary({ reachable: true, status: 401, caseCount: null }).kind === "auth" && evaluateCanary({ reachable: true, status: 401, caseCount: null }).ok === false);
  check("canary 500 → ALARM (source_down)", evaluateCanary({ reachable: true, status: 500, caseCount: null }).kind === "source_down");
  check("canary unreachable → ALARM (source_down)", evaluateCanary({ reachable: false, status: null, caseCount: null }).ok === false);
  check("canary 200 but 0 cases → ALARM (empty)", evaluateCanary({ reachable: true, status: 200, caseCount: 0 }).kind === "empty");
  check("canary 200 with cases → OK", evaluateCanary({ reachable: true, status: 200, caseCount: 42 }).ok === true);
  check("caseCountFromPayload reads cases[]", caseCountFromPayload({ cases: [1, 2, 3] }) === 3);
  check("caseCountFromPayload reads case_count", caseCountFromPayload({ case_count: 7 }) === 7);

  // ProviderError carries its classification.
  const pe = new ProviderError("legaldriver", "auth", "HTTP 401");
  check("ProviderError carries source + kind", pe.source === "legaldriver" && pe.kind === "auth");
}

main().then(() => {
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
});
