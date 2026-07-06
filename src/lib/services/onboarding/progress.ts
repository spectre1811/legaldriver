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
