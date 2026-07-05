// WO-11 · CI gate-matrix test runner.
// Runs the repo's `tests/*.ts` suite in named groups so CI can gate on the
// secret-free ones and keep the DB/LLM ones as an opt-in (secret-gated) job.
//
// Usage:
//   node scripts/run-tests.mjs offline   # secret-free; runs on every PR (CI `build` job)
//   node scripts/run-tests.mjs db        # needs a live Supabase + .env (dormant CI job)
//   node scripts/run-tests.mjs net       # needs LLM/embeddings keys — manual only ($ + live APIs)
//   node scripts/run-tests.mjs all       # everything (local, with .env sourced)
//
// Each test is a standalone tsx entrypoint that exits non-zero on failure. We
// pin tsx (no repo devDependency, so this stays a CI-only change) and run each
// test in its own process, then exit non-zero if any failed.

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

const TSX = "tsx@4.23.0";

// Secret-free: fully mocked, no network, no .env. These GATE every PR.
const OFFLINE = [
  "advocate_state_guard",
  "bp26_case_summary_confidence",
  "ai_gateway",
  "bp17_court_kit",
  "design_tokens_smoke",
  "i18n_coverage",
  "timeline_sort",
  "wo01_causelist_alert",
  "wo01_refresh_priority",
  "wo01_sync_contract",
  "wo15_analytics",
  "wo27_export",
  "wo27_filing_decision",
  "wo27_select_range",
  "wo29_gmail_hygiene",
  "wo29_inbox_status",
  "wo32_code_labels",
  "wo32_review_why",
  "wo33_classification_cache",
  "wo33_grounding",
  "wo33_name_match",
  "wo35_provider_signal",
  "wo39_paginate",
  "wo41_migration_guard",
  "wo42_qa_fixes",
];

// Need a live Supabase (service-role) + .env — runs in the db-tests CI job once the
// TEST_ENV_FILE secret exists. All headless (sign in, service-role probes, RLS checks).
const DB = [
  "p1_smoke",
  "portal_isolation",
  "rls_isolation",
  "wo01_tenancy_sync",
];

// Manual only ($ / a running server / live external APIs). p2_smoke needs `npm start`
// on :3000 AND sends a REAL email → it can't run in a headless CI job.
const NET = [
  "agent_smoke",
  "court_gateway_smoke",
  "document_filing_test",
  "embed_test",
  "p2_smoke",
];

const GROUPS = { offline: OFFLINE, db: DB, net: NET, all: [...OFFLINE, ...DB, ...NET] };

// Self-policing: under many concurrent sessions a new tests/*.ts added by another
// worktree can land on `main` unclassified. Surface it LOUDLY (a GitHub Actions
// ::warning:: annotation is visible on the PR) but do NOT fail — because CI runs on
// the PR merge-ref (branch + current main), a hard failure here would let ONE
// concurrently-merged unclassified test block EVERY subsequent PR across the fleet.
// A warning names the fix without holding the whole queue hostage.
const classified = new Set([...OFFLINE, ...DB, ...NET]);
const orphans = readdirSync("tests")
  .filter((f) => f.endsWith(".ts"))
  .map((f) => f.slice(0, -3))
  .filter((t) => !classified.has(t));
if (orphans.length) {
  const msg =
    `Unclassified test(s) not run by any group: ${orphans.join(", ")}. ` +
    `Add each to a group in scripts/run-tests.mjs (offline = mocked/no-secrets; db = live Supabase; net = LLM/court-API).`;
  console.warn(`::warning title=WO-11 unclassified test::${msg}`);
}

const mode = process.argv[2] || "offline";
const tests = GROUPS[mode];
if (!tests) {
  console.error(`Unknown group "${mode}". Use one of: ${Object.keys(GROUPS).join(", ")}`);
  process.exit(2);
}

console.log(`Running ${tests.length} test(s) in group "${mode}" (tsx ${TSX})\n`);

const failed = [];
for (const t of tests) {
  const started = process.hrtime.bigint();
  const res = spawnSync("npx", ["--yes", TSX, `tests/${t}.ts`], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
  const ms = Number((process.hrtime.bigint() - started) / 1000000n);
  if (res.status === 0) {
    console.log(`✅ ${t}  (${ms}ms)`);
  } else {
    failed.push(t);
    console.log(`❌ ${t}  (exit ${res.status ?? "signal " + res.signal})`);
    const tail = `${res.stdout || ""}${res.stderr || ""}`.trimEnd().split("\n").slice(-12);
    console.log(tail.map((l) => `     ${l}`).join("\n"));
  }
}

console.log(`\n==== ${tests.length - failed.length}/${tests.length} passed ====`);
if (failed.length) {
  console.error(`FAILED: ${failed.join(" ")}`);
  process.exit(1);
}
