// WO-61 W2 · the i18n stage key + the "still gathering in the background" decision.
// Pure/offline — no network, no .env. Run: npx tsx tests/wo61_onboarding_progress.ts
import { onboardingProgress, isGathering, GATHERING_WINDOW_MS } from "../src/lib/services/onboarding/progress";

let failures = 0;
const check = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failures++; };

// ── stageKey (drives the localized label; EN `label` stays the fallback) ──────
check("fetch → stageKey 'fetch'", onboardingProgress("fetch", "running").stageKey === "fetch");
check("done → stageKey 'done'", onboardingProgress("done", "done").stageKey === "done");
check("error status → stageKey 'error'", onboardingProgress("enrich", "error").stageKey === "error");
check("error stage → stageKey 'error'", onboardingProgress("error", "running").stageKey === "error");
check("queued/null → stageKey 'queued'", onboardingProgress(null, "running").stageKey === "queued");
check("unknown stage → stageKey 'working' (not the raw stage)", onboardingProgress("mystery", "running").stageKey === "working");
check("stageKey never empty across all real stages",
  ["causelist", "fetch", "enrich", "deadlines", "inbox", "closed", "summaries", "done"].every((s) => onboardingProgress(s, "running").stageKey.length > 0));

// ── isGathering: show the persistent background state only while the fleet is landing the roster ──
const now = 1_000_000_000_000;
const recent = new Date(now - 60_000).toISOString();      // 1 min ago
const stale = new Date(now - GATHERING_WINDOW_MS - 1000).toISOString();

check("fetch_pending + recent start → gathering", isGathering({ cursor: { fetch_pending: true, fetch_started_at: recent } }, now) === true);
check("fetch_pending but past the window → NOT gathering", isGathering({ cursor: { fetch_pending: true, fetch_started_at: stale } }, now) === false);
check("no cursor → not gathering", isGathering({ cursor: null }, now) === false);
check("cursor without fetch_pending → not gathering", isGathering({ cursor: { something: 1 } }, now) === false);
check("fetch_pending=false → not gathering", isGathering({ cursor: { fetch_pending: false } }, now) === false);
check("falls back to updatedAt when no fetch_started_at", isGathering({ cursor: { fetch_pending: true }, updatedAt: recent }, now) === true);
check("bad timestamp → not gathering (never throws)", isGathering({ cursor: { fetch_pending: true, fetch_started_at: "not-a-date" } }, now) === false);
check("null run → not gathering", isGathering(null, now) === false);

console.log(failures === 0 ? "\n✅ all wo61 progress/gathering checks passed" : `\n❌ ${failures} failing`);
process.exit(failures === 0 ? 0 : 1);
