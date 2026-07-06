// WO-63 · For days the fleet merged fixes to `main` but production never redeployed (Vercel Hobby
// deploy-quota stall) — prod sat 8+ commits behind and NOTHING compared the running SHA to main, so a
// total deploy stall produced zero signal. This locks the deploy-freshness contract that closes that:
//   1. evaluateFreshness — pure kernel: current → ok; a lag past the grace window → stale ALARM;
//      a lag still inside the grace window (deploy mid-flight) → ok; missing prod/main SHA → NOT an
//      alarm ("unknown") so it never cries wolf.
//   2. fetchMainLag — parses GitHub's compare API (ahead_by = commitsBehind; commits[0] = oldest
//      un-deployed → age; commits[last] = main HEAD) and degrades to a non-alarming "unknown" on any
//      HTTP/network error.
// Run: npx tsx tests/wo63_deploy_freshness.ts
import { evaluateFreshness, fetchMainLag, DEPLOY_GRACE_MIN_DEFAULT } from "../src/lib/ops/deploy-freshness";

let failures = 0;
const check = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failures++; };

const PROD = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MAIN = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

async function main() {
  // ── (1) evaluateFreshness — the pure kernel ───────────────────────────────
  // Current: prod === main.
  const cur = evaluateFreshness({ prodSha: PROD, mainSha: PROD, commitsBehind: 0, oldestUnshippedAgeMin: 0 });
  check("current (prod==main) → ok", cur.ok && cur.severity === "ok");

  // Current: commitsBehind 0 even if SHAs differ in the (impossible) edge — 0 behind is current.
  const cur2 = evaluateFreshness({ prodSha: PROD, mainSha: MAIN, commitsBehind: 0, oldestUnshippedAgeMin: null });
  check("0 commits behind → ok", cur2.ok && cur2.severity === "ok");

  // Lag PAST the grace window → stale ALARM (the incident).
  const stale = evaluateFreshness({ prodSha: PROD, mainSha: MAIN, commitsBehind: 8, oldestUnshippedAgeMin: 240 });
  check("8 commits behind for 240m → stale ALARM", !stale.ok && stale.severity === "stale");
  check("stale detail names the gap", stale.detail.includes("8 commits behind"));
  check("stale detail carries both short SHAs", stale.detail.includes("aaaaaaa") && stale.detail.includes("bbbbbbb"));

  // Lag still INSIDE the grace window → hold the alarm (deploy is probably mid-build).
  const fresh = evaluateFreshness({ prodSha: PROD, mainSha: MAIN, commitsBehind: 1, oldestUnshippedAgeMin: 5 });
  check("1 commit behind for 5m → ok (within grace)", fresh.ok && fresh.severity === "ok");

  // Grace boundary: exactly at the default grace → alarm (age < grace is the ok condition).
  const atGrace = evaluateFreshness({ prodSha: PROD, mainSha: MAIN, commitsBehind: 1, oldestUnshippedAgeMin: DEPLOY_GRACE_MIN_DEFAULT });
  check("lag age == grace → stale (boundary is strict <)", !atGrace.ok && atGrace.severity === "stale");

  // Unknown age but behind → cannot claim it's within grace → alarm (fail toward visibility).
  const unkAge = evaluateFreshness({ prodSha: PROD, mainSha: MAIN, commitsBehind: 3, oldestUnshippedAgeMin: null });
  check("behind with unknown age → stale", !unkAge.ok && unkAge.severity === "stale");

  // Missing prod SHA → unknown, NOT an alarm (never false-positive on a local/non-Vercel run).
  const noProd = evaluateFreshness({ prodSha: null, mainSha: MAIN, commitsBehind: 0, oldestUnshippedAgeMin: null });
  check("no prod SHA → unknown + ok (no false alarm)", noProd.ok && noProd.severity === "unknown");
  check("no prod SHA → detail names VERCEL_GIT_COMMIT_SHA", noProd.detail.includes("VERCEL_GIT_COMMIT_SHA"));

  // Missing main SHA (couldn't read GitHub) → unknown, NOT an alarm; detail names the token.
  const noMain = evaluateFreshness({ prodSha: PROD, mainSha: null, commitsBehind: 0, oldestUnshippedAgeMin: null });
  check("no main SHA → unknown + ok (no false alarm)", noMain.ok && noMain.severity === "unknown");
  check("no main SHA → detail names GITHUB_FRESHNESS_TOKEN", noMain.detail.includes("GITHUB_FRESHNESS_TOKEN"));

  // Custom grace honoured.
  const tight = evaluateFreshness({ prodSha: PROD, mainSha: MAIN, commitsBehind: 1, oldestUnshippedAgeMin: 5, graceMin: 2 });
  check("custom grace=2, age=5 → stale", !tight.ok && tight.severity === "stale");

  // ── (2) fetchMainLag — GitHub compare parsing (fetch stubbed) ──────────────
  const realFetch = globalThis.fetch;
  const NOW = 1_700_000_000_000; // fixed clock so age math is deterministic
  try {
    // Ahead by 2: oldest commit 60m old, HEAD is the last commit's sha.
    const oldestDate = new Date(NOW - 60 * 60000).toISOString();
    globalThis.fetch = (async () => ({
      ok: true, status: 200,
      json: async () => ({
        status: "ahead", ahead_by: 2,
        commits: [
          { sha: "c1oldc1oldc1oldc1oldc1oldc1oldc1oldc1old", commit: { committer: { date: oldestDate } } },
          { sha: MAIN, commit: { committer: { date: new Date(NOW - 3 * 60000).toISOString() } } },
        ],
      }),
    })) as unknown as typeof fetch;
    const lag = await fetchMainLag({ repo: "spectre1811/legaldriver", prodSha: PROD, now: NOW });
    check("compare ahead_by → commitsBehind", lag.commitsBehind === 2);
    check("compare → main HEAD = last commit sha", lag.mainSha === MAIN);
    check("compare → oldest un-deployed age ≈ 60m", lag.oldestUnshippedAgeMin === 60);
    check("compare has no error", lag.error === undefined);

    // Identical (prod IS main): no commits → mainSha falls back to prodSha, 0 behind.
    globalThis.fetch = (async () => ({
      ok: true, status: 200, json: async () => ({ status: "identical", ahead_by: 0, commits: [] }),
    })) as unknown as typeof fetch;
    const same = await fetchMainLag({ repo: "spectre1811/legaldriver", prodSha: PROD, now: NOW });
    check("identical → 0 behind", same.commitsBehind === 0);
    check("identical → mainSha == prodSha", same.mainSha === PROD);

    // HTTP error (e.g. 404 private repo, no token) → non-alarming unknown facts.
    globalThis.fetch = (async () => ({ ok: false, status: 404, json: async () => ({}) })) as unknown as typeof fetch;
    const err = await fetchMainLag({ repo: "spectre1811/legaldriver", prodSha: PROD, now: NOW });
    check("HTTP 404 → mainSha null (unknown)", err.mainSha === null);
    check("HTTP 404 → error is surfaced", (err.error || "").includes("404"));

    // Network throw → unknown facts, surfaced error.
    globalThis.fetch = (async () => { throw new Error("ENOTFOUND"); }) as unknown as typeof fetch;
    const net = await fetchMainLag({ repo: "spectre1811/legaldriver", prodSha: PROD, now: NOW });
    check("network throw → mainSha null", net.mainSha === null);
    check("network throw → error surfaced", (net.error || "").includes("ENOTFOUND"));
  } finally {
    globalThis.fetch = realFetch;
  }

  // ── end-to-end: a stubbed compare feeding the kernel yields the ALARM ──────
  {
    const lag = { mainSha: MAIN, commitsBehind: 5, oldestUnshippedAgeMin: 180 };
    const out = evaluateFreshness({ prodSha: PROD, ...lag });
    check("stale compare → kernel alarm (integration)", !out.ok && out.severity === "stale");
  }

  console.log(`\n==== ${failures === 0 ? "ALL PASS" : failures + " FAILED"} ====`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
