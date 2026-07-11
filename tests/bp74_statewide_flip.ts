// BP-74 W3 · legaldriver onboarding flips to the ONE server-side statewide fan-out.
// Pure/offline (a mocked global.fetch — no network, no .env). Run: npx tsx tests/bp74_statewide_flip.ts
//
// Proves the client flip + its safety gate + the honest coverage copy:
//   • FLAG OFF (default): startLiveAdvocateRefresh keeps firing the PER-SCOPE `/advocate/{serial}/refresh`
//     loop (drained by the live fleet) — so merging the flip is a no-op until the drainer is deployed AND
//     the founder flips LD_ADVOCATE_STATEWIDE_FANOUT=1 (that ordering is what stops an undrained enqueue).
//   • FLAG ON: it fires exactly ONE `/advocate/{serial}/refresh-statewide?year=&bar_state=&state_code=`
//     (no 332-scope client burst on the box EIP, BP-66) with the canonical params.
//   • advocateFanoutJobId is the canonical STATE/SERIAL/YEAR the status endpoint is polled by.
//   • advocateFanoutCoverageNote NEVER emits a bare "0 cases": a zero → "none in the N courts we
//     searched"; a WAF-stopped/partial run says so; and no fan-out record → null (caller keeps prior copy).

import {
  startLiveAdvocateRefresh,
  statewideFanoutEnabled,
  advocateFanoutJobId,
  advocateFanoutCoverageNote,
  type AdvocateFanoutStatus,
} from "../src/lib/court/advocate-cases";
import { parseBarNumber, stateBarCouncil } from "../src/lib/court/bar-number";

let failures = 0;
const check = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failures++; };

// ── a fetch spy: records every URL + method, resolves ok (fire-and-forget never reads the body) ──
type Call = { url: string; method: string };
function withFetchSpy<T>(fn: (calls: Call[]) => T): T {
  const calls: Call[] = [];
  const orig = globalThis.fetch;
  // @ts-expect-error — test double
  globalThis.fetch = (url: string | URL, init?: { method?: string }) => {
    calls.push({ url: String(url), method: init?.method ?? "GET" });
    return Promise.resolve({ ok: true, status: 202, json: async () => ({}) } as Response);
  };
  try { return fn(calls); } finally { globalThis.fetch = orig; }
}

const Q = { name: "M H SOLANKI", barNumber: "G/4732/1999", stateCode: "GJ", live: true as const };

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) { prev[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  try { fn(); } finally { for (const k of Object.keys(prev)) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; } }
}

// ── FLAG OFF → the per-scope loop (unchanged fallback) ──────────────────────────
withEnv({ LD_API_KEY: "ld_test", LD_ADVOCATE_STATEWIDE_FANOUT: undefined }, () => {
  check("flag reads OFF by default", statewideFanoutEnabled() === false);
  withFetchSpy((calls) => {
    const fired = startLiveAdvocateRefresh(Q);
    check("OFF: refresh still dispatched", fired === true);
    check("OFF: fires the per-scope /refresh loop (≥1 call)", calls.length >= 1);
    check("OFF: every call is a per-scope /refresh (never refresh-statewide)",
      calls.length > 0 && calls.every((c) => c.url.includes("/refresh?") && !c.url.includes("refresh-statewide")));
    check("OFF: all POST", calls.every((c) => c.method === "POST"));
  });
});

// ── FLAG ON → exactly ONE refresh-statewide with the canonical params ───────────
withEnv({ LD_API_KEY: "ld_test", LD_ADVOCATE_STATEWIDE_FANOUT: "1", LD_API_BASE: "http://api.test:8080" }, () => {
  check("flag reads ON", statewideFanoutEnabled() === true);
  withFetchSpy((calls) => {
    const fired = startLiveAdvocateRefresh(Q);
    check("ON: refresh dispatched", fired === true);
    check("ON: EXACTLY ONE upstream call (no 332-scope client burst)", calls.length === 1);
    const c = calls[0];
    check("ON: it is the refresh-statewide endpoint", !!c && c.url.includes("/advocate/4732/refresh-statewide?"));
    check("ON: POST", !!c && c.method === "POST");
    check("ON: carries year=1999", !!c && c.url.includes("year=1999"));
    check("ON: carries bar_state=G", !!c && /[?&]bar_state=G(&|$)/.test(c.url));
    check("ON: carries numeric state_code=17", !!c && c.url.includes("state_code=17"));
  });
});

// ── ON but no API key → nothing fires, no throw ─────────────────────────────────
withEnv({ LD_API_KEY: undefined, LD_ADVOCATE_STATEWIDE_FANOUT: "1" }, () => {
  withFetchSpy((calls) => {
    const fired = startLiveAdvocateRefresh(Q);
    check("no key → not dispatched + zero calls", fired === false && calls.length === 0);
  });
});

// ── canonical job id (STATE/SERIAL/YEAR) ────────────────────────────────────────
const parsed = parseBarNumber("G/4732/1999")!;
const gujarat = stateBarCouncil("GJ")!;
check("advocateFanoutJobId is canonical STATE/SERIAL/YEAR", advocateFanoutJobId(parsed, gujarat) === "G/4732/1999");

// ── coverage note: honest, never a bare "0 cases" ───────────────────────────────
const full: AdvocateFanoutStatus = { fanout: { state: "done", scopes_planned: 332, scopes_searched: 332, cases_found: 255, scope_complete: true, stopped: false } };
check("coverage: full run reports courts + cases", advocateFanoutCoverageNote(full, "Gujarat") === "Searched 332 courts across Gujarat — 255 cases found.");

const empty: AdvocateFanoutStatus = { fanout: { state: "done", scopes_searched: 332, cases_found: 0, scope_complete: true, stopped: false } };
const emptyNote = advocateFanoutCoverageNote(empty, "Gujarat") ?? "";
check("coverage: ZERO is framed as 'none in the courts we searched', not a bare 0",
  emptyNote.includes("332 courts across Gujarat") && emptyNote.toLowerCase().includes("no cases") && !/\b0 cases\b/.test(emptyNote));

const stopped: AdvocateFanoutStatus = { fanout: { state: "done", scopes_searched: 300, cases_found: 40, scope_complete: false, stopped: true } };
const stoppedNote = advocateFanoutCoverageNote(stopped, "Gujarat") ?? "";
check("coverage: a WAF-stopped/partial run says so (re-onboard to finish)",
  stoppedNote.includes("300 courts") && /next refresh|timed out/.test(stoppedNote));

check("coverage: no fan-out record → null (caller keeps its prior copy)",
  advocateFanoutCoverageNote(null, "Gujarat") === null && advocateFanoutCoverageNote({}, "Gujarat") === null);

check("coverage: singular grammar (1 court / 1 case)",
  advocateFanoutCoverageNote({ fanout: { scopes_searched: 1, cases_found: 1, scope_complete: true } }, "Gujarat") === "Searched 1 court across Gujarat — 1 case found.");

// ── summary ─────────────────────────────────────────────────────────────────────
if (failures) { console.error(`\n${failures} check(s) FAILED`); process.exit(1); }
console.log("\nall BP-74 statewide-flip checks passed");
