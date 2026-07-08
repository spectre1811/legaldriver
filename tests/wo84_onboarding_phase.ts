// WO-84: the truthful onboarding phase model — the single state machine the redesigned onboarding UI
// renders from. Coverage-aware (complete decided by N-of-M on file, not a blind clock) + stall-aware
// (a silent stuck fetch degrades to `stalled`, never a forever spinner). Offline, no secrets.
// Run: npx tsx tests/wo84_onboarding_phase.ts
import {
  onboardingPhase,
  shouldNotifyCompletion,
  GATHERING_WINDOW_MS,
  STALL_WINDOW_MS,
} from "../src/lib/services/onboarding/progress";

let failures = 0;
const check = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failures++; };

const NOW = Date.parse("2026-07-09T12:00:00Z");
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

// idle — no run at all
check("null run → idle, inactive", (() => { const p = onboardingPhase(null, NOW); return p.kind === "idle" && !p.active; })());

// error — from status or stage, never active
check("status=error → error, inactive", onboardingPhase({ status: "error", stage: "enrich" }, NOW).kind === "error");
check("stage=error → error", onboardingPhase({ status: "running", stage: "error" }, NOW).kind === "error");

// assembling — a drain is running server-side → foreground, active, carries the stage bar
const asm = onboardingPhase({ status: "running", stage: "enrich", counts: { roster_total: 100, enriched: 10 } }, NOW);
check("running → assembling + active + advancing bar", asm.kind === "assembling" && asm.active && asm.progress.percent > 0 && !asm.progress.done);

// complete — fetch pending but the roster is fully on file ⇒ coverage wins over a stale pending flag
const doneFull = onboardingPhase(
  { status: "done", stage: "done", counts: { roster_total: 50, cases_fetched: 50, enriched: 50 }, cursor: { fetch_pending: true }, updatedAt: iso(1000) },
  NOW,
);
check("pending but N>=M → complete (coverage beats stale flag), inactive", doneFull.kind === "complete" && !doneFull.active);

// complete — no pending fetch flag at all
check("done + no fetch_pending → complete", onboardingPhase({ status: "done", stage: "done", counts: { roster_total: 5, cases_fetched: 5 }, cursor: {} }, NOW).kind === "complete");

// gathering — pending + roster not yet fully on file + recent activity → background, still active
const gathering = onboardingPhase(
  { status: "done", stage: "done", counts: { roster_total: 258, cases_fetched: 43 }, cursor: { fetch_pending: true, fetch_started_at: iso(60_000) }, updatedAt: iso(30_000) },
  NOW,
);
check("pending + partial + recent → gathering + active", gathering.kind === "gathering" && gathering.active && gathering.coverage.total === 258 && gathering.coverage.onFile === 258);
check("gathering coverage.filling reflects detail still pulling", gathering.coverage.filling === true);

// known roster, partial counts, but past the window / gone quiet → complete, NOT a false stall.
// (cases_fetched reads 0 on an idempotent re-run of a fully-warehoused advocate, so a partial count can't
//  reliably mean "stuck" — only a stone-cold zero is a confident stall. This documents that choice.)
const quietPartial = onboardingPhase(
  { status: "done", stage: "done", counts: { roster_total: 258, cases_fetched: 43, enriched: 43 }, cursor: { fetch_pending: true, fetch_started_at: iso(STALL_WINDOW_MS + 60_000) }, updatedAt: iso(STALL_WINDOW_MS + 60_000) },
  NOW,
);
check("pending + partial + gone quiet → complete (no false stall), inactive", quietPartial.kind === "complete" && !quietPartial.active);

// unknown roster (M=0): gathering inside the window, stalled once past it (nothing ever landed)
const unknownEarly = onboardingPhase(
  { status: "done", stage: "fetch", counts: {}, cursor: { fetch_pending: true, fetch_started_at: iso(60_000) }, updatedAt: iso(60_000) },
  NOW,
);
check("unknown roster, in window → gathering", unknownEarly.kind === "gathering" && unknownEarly.active);
const unknownLate = onboardingPhase(
  { status: "done", stage: "fetch", counts: {}, cursor: { fetch_pending: true, fetch_started_at: iso(GATHERING_WINDOW_MS + 60_000) }, updatedAt: iso(GATHERING_WINDOW_MS + 60_000) },
  NOW,
);
check("unknown roster, past window, nothing landed → stalled", unknownLate.kind === "stalled" && !unknownLate.active);

// robustness — a malformed/missing timestamp must never throw and never claim active forever
check("missing timestamps don't throw", (() => { try { onboardingPhase({ status: "done", counts: {}, cursor: { fetch_pending: true } }, NOW); return true; } catch { return false; } })());

// notification transition rule
check("notify: gathering → complete fires", shouldNotifyCompletion("gathering", "complete") === true);
check("notify: assembling → complete fires", shouldNotifyCompletion("assembling", "complete") === true);
check("notify: stalled → complete fires", shouldNotifyCompletion("stalled", "complete") === true);
check("notify: complete → complete does NOT refire (revisit)", shouldNotifyCompletion("complete", "complete") === false);
check("notify: idle → complete does NOT fire", shouldNotifyCompletion("idle", "complete") === false);
check("notify: no prev → complete does NOT fire", shouldNotifyCompletion(null, "complete") === false);
check("notify: non-complete next never fires", shouldNotifyCompletion("assembling", "gathering") === false);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
