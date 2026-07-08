// BP-71 W2: the pure, testable model behind the onboarding progress bar. The orchestrator
// (`runOnboarding`) writes its current `stage` + `counts` to `onboarding_run` as it goes; the UI polls
// that record (`getOnboardingStatus`) and renders this. Kept pure (no React/Supabase) so the stage→
// percent/label mapping is unit-tested offline. Labels are hardcoded EN to match this surface's existing
// client strings ("Running…"); hi translation is a polish follow-up (does not touch the i18n JSON gate).

// The meaningful stages in order (excludes the pre-start "queued"). Mirrors runOnboarding's setRun calls.
export const ONBOARDING_STAGES = [
  "causelist", "fetch", "enrich", "deadlines", "inbox", "closed", "summaries", "done",
] as const;

export const STAGE_LABEL: Record<string, string> = {
  queued: "Starting…",
  causelist: "Reading your cause list",
  fetch: "Fetching your cases",
  enrich: "Enriching case details",
  deadlines: "Proposing deadlines",
  inbox: "Filing emails",
  closed: "Finding closed cases",
  summaries: "Queuing AI briefings",
  done: "Done",
  error: "Something went wrong",
};

export interface OnboardingProgress {
  index: number;    // stages completed (0..total)
  total: number;    // total meaningful stages
  percent: number;  // 0..100 (never 100 until done)
  label: string;    // human label for the CURRENT stage (EN fallback)
  stageKey: string; // WO-61: canonical stage id for i18n lookup (queued|causelist|…|done|error|working)
  done: boolean;
  error: boolean;
}

// Map an onboarding_run's (stage, status) to a progress bar. Robust to unknown/missing stages
// (degrades to "working", never throws) so a schema tweak can't break the UI.
export function onboardingProgress(stage?: string | null, status?: string | null): OnboardingProgress {
  const total = ONBOARDING_STAGES.length - 1;              // exclude the terminal "done" from the denom
  if (status === "error" || stage === "error") {
    return { index: 0, total, percent: 0, label: STAGE_LABEL.error, stageKey: "error", done: false, error: true };
  }
  const s = stage || "queued";
  if (status === "done" || s === "done") {
    return { index: total, total, percent: 100, label: STAGE_LABEL.done, stageKey: "done", done: true, error: false };
  }
  const at = (ONBOARDING_STAGES as readonly string[]).indexOf(s);  // -1 for "queued"/unknown → treat as 0
  const index = at < 0 ? 0 : at;
  // The current stage is in-progress → count it as ~half done so the bar always visibly advances.
  const percent = Math.min(95, Math.max(3, Math.round(((index + 0.5) / total) * 100)));
  const known = STAGE_LABEL[s];
  return { index, total, percent, label: known || "Working…", stageKey: known ? s : "working", done: false, error: false };
}

// WO-61: is the advocate's full roster still landing in the background? The orchestrator flags a run
// `cursor.fetch_pending` the moment it fires the OFF-BOX async fleet refresh (which ingests the roster
// into our warehouse over the following minutes). While that flag is set AND we're inside the window
// the fleet typically takes to drain, the UI shows a persistent "still gathering — you can leave"
// state and keeps harvesting — so a working async pipeline never reads as a silent blackhole (the
// founder's core complaint). Pure + offline-tested; no schema change (reads the existing jsonb cursor).
export const GATHERING_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

// WO-84: after this long with NO new arrival while a fetch is still pending, we stop claiming "still
// gathering" (a working pipeline lands cases steadily; a long silence means it's stuck or finished-empty)
// and surface an honest, actionable "we've paused — refresh or re-run" state instead of a forever-spinner.
export const STALL_WINDOW_MS = 20 * 60 * 1000; // 20 minutes of silence

export function isGathering(
  run: { cursor?: Record<string, unknown> | null; updatedAt?: string | null } | null | undefined,
  nowMs: number,
): boolean {
  const cursor = run?.cursor;
  if (!cursor || cursor.fetch_pending !== true) return false;
  const startedRaw = cursor.fetch_started_at ? String(cursor.fetch_started_at) : run?.updatedAt ?? "";
  const started = Date.parse(startedRaw);
  if (!Number.isFinite(started)) return false;
  return nowMs - started < GATHERING_WINDOW_MS;
}

// WO-84: the single, truthful phase an onboarding run is in — the state machine the whole UI renders
// from. This supersedes the split "progress bar while running" + "isGathering guess" logic with ONE
// coverage-aware classification, fixing the founder's core complaints:
//   • "don't lose it when tabs change" — the phase is derived purely from the persisted run record, so
//     any tab / reload reconstructs the exact same state (no client-only memory to lose).
//   • "without any hiccups / not a forever spinner" — `complete` is decided by real coverage (N of M on
//     file), not a blind 30-min clock; a genuinely-stuck fetch degrades to `stalled` (actionable), never
//     an eternal "still gathering".
//   • "work in the background + notify" — `assembling` (foreground drain) vs `gathering` (background
//     fleet) are distinct, and a transition INTO `complete` is what fires the completion notification.
export type OnboardingPhaseKind =
  | "idle"        // no run yet — show the entry / empty state
  | "assembling"  // a drain is actively running server-side — foreground progress bar
  | "gathering"   // drain returned; the off-box fleet is still landing the roster — "you can leave"
  | "stalled"     // fetch still pending but gone silent past STALL_WINDOW — nudge to refresh / re-run
  | "complete"    // everything the run set out to fetch is on file
  | "error";      // the run failed — human message + recovery

export interface OnboardingPhase {
  kind: OnboardingPhaseKind;
  progress: OnboardingProgress; // the stage→percent bar (for `assembling`)
  coverage: OnboardingCoverage; // the N-of-M meter (for `gathering`/`complete`)
  /** true while cases are still expected to land (assembling or gathering) — drives the client harvest poll. */
  active: boolean;
}

export function onboardingPhase(
  run:
    | {
        stage?: string | null;
        status?: string | null;
        counts?: Record<string, number> | null;
        cursor?: Record<string, unknown> | null;
        updatedAt?: string | null;
      }
    | null
    | undefined,
  nowMs: number,
): OnboardingPhase {
  const progress = onboardingProgress(run?.stage, run?.status);
  const coverage = onboardingCoverage(run?.counts);
  const base = { progress, coverage };
  if (!run) return { ...base, kind: "idle", active: false };
  if (progress.error) return { ...base, kind: "error", active: false };
  // A drain is actively running server-side → foreground bar.
  if (run.status === "running") return { ...base, kind: "assembling", active: true };

  // Drain returned. Is the off-box fleet still expected to be landing the roster?
  const pending = run.cursor?.fetch_pending === true;
  if (!pending) return { ...base, kind: "complete", active: false };

  // `pending` is a fire-and-forget flag the orchestrator sets when it kicks the off-box fleet; nothing
  // clears it, so we can't trust it alone. Decide truthfully from what's ACTUALLY landed + elapsed time.
  // `landed` is the real count in the warehouse this run (roster size once known, else what was seeded) —
  // NOT coverage.onFile, which optimistically equals the roster the instant M is known.
  const c = run.counts || {};
  const rosterTotal = num(c.roster_total);
  const landed = Math.max(num(c.cases_fetched), num(c.matters_seeded));
  const somethingArrived = rosterTotal > 0 || landed > 0;
  // Everything the run set out to fetch is demonstrably on file → complete, even if the flag is stale.
  if (rosterTotal > 0 && landed >= rosterTotal) return { ...base, kind: "complete", active: false };

  const startedRaw = run.cursor?.fetch_started_at ? String(run.cursor.fetch_started_at) : run.updatedAt ?? "";
  const started = Date.parse(startedRaw);
  const updated = Date.parse(run.updatedAt ?? startedRaw);
  const inWindow = Number.isFinite(started) && nowMs - started < GATHERING_WINDOW_MS;
  const quiet = Number.isFinite(updated) && nowMs - updated > STALL_WINDOW_MS;
  // Actively working: inside the window the fleet normally takes AND cases have arrived recently.
  if (inWindow && !quiet) return { ...base, kind: "gathering", active: true };
  // Time's up (past window) or gone silent: if we got a roster / any cases, the fleet had its run —
  // call it complete (the honest empty-state note covers a true zero). If NOTHING ever came, be honest
  // that we're stuck rather than spin forever — `stalled` offers refresh / re-run.
  return { ...base, kind: somethingArrived ? "complete" : "stalled", active: false };
}

// WO-84: fire the completion notification exactly on the transition INTO `complete` from a phase where
// work was still outstanding — never on first load of an already-complete run (that would spam a
// notification every revisit), and never from `idle`/`error`. Pure so the "when to notify" rule is
// unit-tested, not buried in a component effect.
export function shouldNotifyCompletion(
  prev: OnboardingPhaseKind | null | undefined,
  next: OnboardingPhaseKind,
): boolean {
  if (next !== "complete") return false;
  return prev === "assembling" || prev === "gathering" || prev === "stalled";
}

// WO-65: honest import coverage from a run's counts. `total` (M) = the advocate's FULL roster size; the
// bulk seed lands all M as matters (`onFile`), then enrich pulls each one's warehouse detail (`detailed`,
// E). Pure + offline-tested so the "N of M imported" UX can never drift from the tallies. Robust to an
// older run with no `roster_total` (falls back to what was seeded this run) so it never shows a false 0.
export interface OnboardingCoverage {
  total: number;    // M — advocate's full roster size (0 = not yet fetched / unknown)
  onFile: number;   // N — roster cases now imported as matters (== total once the seed lands)
  detailed: number; // E — matters enriched with full detail (hearings on the calendar)
  filling: boolean; // true while detail is still being pulled (E < M)
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function onboardingCoverage(counts: Record<string, number> | null | undefined): OnboardingCoverage {
  const c = counts || {};
  const total = num(c.roster_total);
  const onFile = total > 0 ? total : num(c.cases_fetched) + num(c.matters_seeded);
  const detailed = total > 0 ? Math.min(num(c.enriched), total) : num(c.enriched);
  return { total, onFile, detailed, filling: total > 0 && detailed < total };
}

// A short honest one-liner of what's landed so far, from the run's counts. Leads with roster coverage
// ("M cases on file · N of M detailed") so the user watches their FULL practice arrive — not just what
// was new this run (cases_fetched reads 0 on an idempotent re-run). Only shows non-zero tallies so an
// early stage never reads as "0 cases, 0 matters" (which looks like a failure).
export function onboardingCountsSummary(counts: Record<string, number> | null | undefined): string {
  const c = counts || {};
  const cov = onboardingCoverage(counts);
  const parts: string[] = [];
  if (cov.total > 0) {
    parts.push(`${cov.total} ${cov.total === 1 ? "case on file" : "cases on file"}`);
    if (cov.detailed > 0) parts.push(cov.filling ? `${cov.detailed} of ${cov.total} detailed` : "all details in");
  } else {
    const v = num(c.cases_fetched);
    if (v > 0) parts.push(`${v} ${v === 1 ? "case on file" : "cases on file"}`);
    const e = num(c.enriched);
    if (e > 0) parts.push(`${e} detailed`);
  }
  const cl = num(c.matters_seeded);
  if (cl > 0) parts.push(`${cl} from your cause list`);
  const dl = num(c.deadlines_proposed);
  if (dl > 0) parts.push(`${dl} ${dl === 1 ? "deadline" : "deadlines"}`);
  return parts.join(" · ");
}
