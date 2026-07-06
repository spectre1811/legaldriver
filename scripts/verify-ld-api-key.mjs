#!/usr/bin/env node
// WO-64 · Verify that an `LD_API_KEY` actually AUTHENTICATES against the LegalDriver box.
//
// The incident: the prod key rotted to a corrupt `{"v":"v2","c":…}` blob and, because it was stored as
// a Vercel "sensitive" secret (value not readable back), every "I set the key" was UNVERIFIABLE — a
// wrong key was invisible until users saw 0 cases. This is the one-liner that makes the key verifiable:
// it hits the box's warehouse read for a known advocate and reports whether auth works.
//
// Usage (locally, or in a deploy step with the real value in the environment):
//   LD_API_KEY=ld_… node scripts/verify-ld-api-key.mjs
//   LD_API_KEY=ld_… LD_API_BASE=http://<box>:8080 node scripts/verify-ld-api-key.mjs
// Exit 0 = authenticated + non-empty roster; non-zero = auth failed / empty / unreachable (with why).
//
// This intentionally lives OUTSIDE the app runtime so it can be run against ANY environment's value
// (paste the value you're about to set and confirm it before storing it).

const KEY = process.env.LD_API_KEY;
const BASE = process.env.LD_API_BASE || "http://13.202.148.71:8080";
const BAR_ID = process.env.LD_API_CANARY_BAR_ID || "G/702/2020";
const TIMEOUT_MS = Number(process.env.LD_API_TIMEOUT_MS ?? "15000");

function fail(msg) { console.error(`✗ FAIL — ${msg}`); process.exit(1); }

if (!KEY) fail("LD_API_KEY is not set in the environment.");
if (/^\{.*"v".*"c".*\}$/.test(KEY.trim())) {
  // Catch the exact incident shape early: an encrypted envelope was pasted in place of the raw key.
  fail(`LD_API_KEY looks like an ENCRYPTED ENVELOPE ({"v":…,"c":…}, ${KEY.length} chars), not a raw ld_… key. This is the WO-64 corruption — store the RAW key.`);
}

const url = `${BASE}/advocate/${encodeURIComponent(BAR_ID)}`;
try {
  const r = await fetch(url, { headers: { "X-API-Key": KEY }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (r.status === 401 || r.status === 403) fail(`box returned ${r.status} — the key is WRONG (auth rejected). Check LD_API_KEY.`);
  if (r.status >= 500) fail(`box returned ${r.status} — the source is down (transient). Retry.`);
  if (!r.ok) fail(`box returned ${r.status} for ${BAR_ID}.`);
  let count = 0;
  try { const j = await r.json(); count = Array.isArray(j?.cases) ? j.cases.length : (typeof j?.case_count === "number" ? j.case_count : 0); } catch { /* count stays 0 */ }
  if (count <= 0) fail(`authenticated (HTTP ${r.status}) but 0 cases for ${BAR_ID} — the key or the warehouse is suspect (expected a non-empty known roster).`);
  console.log(`✓ PASS — key authenticates against ${BASE}; ${count} cases for ${BAR_ID} (HTTP ${r.status}).`);
  process.exit(0);
} catch (e) {
  fail(`box unreachable at ${BASE} (${e instanceof Error ? e.message : "network error"}).`);
}
