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
  label: string;    // human label for the CURRENT stage
  done: boolean;
  error: boolean;
}

// Map an onboarding_run's (stage, status) to a progress bar. Robust to unknown/missing stages
// (degrades to "working", never throws) so a schema tweak can't break the UI.
export function onboardingProgress(stage?: string | null, status?: string | null): OnboardingProgress {
  const total = ONBOARDING_STAGES.length - 1;              // exclude the terminal "done" from the denom
  if (status === "error" || stage === "error") {
    return { index: 0, total, percent: 0, label: STAGE_LABEL.error, done: false, error: true };
  }
  const s = stage || "queued";
  if (status === "done" || s === "done") {
    return { index: total, total, percent: 100, label: STAGE_LABEL.done, done: true, error: false };
  }
  const at = (ONBOARDING_STAGES as readonly string[]).indexOf(s);  // -1 for "queued"/unknown → treat as 0
  const index = at < 0 ? 0 : at;
  // The current stage is in-progress → count it as ~half done so the bar always visibly advances.
  const percent = Math.min(95, Math.max(3, Math.round(((index + 0.5) / total) * 100)));
  return { index, total, percent, label: STAGE_LABEL[s] || "Working…", done: false, error: false };
}

// A short honest one-liner of what's been seeded so far, from the run's counts. Only shows non-zero
// tallies so an early stage doesn't read as "0 cases, 0 matters" (which looks like a failure).
export function onboardingCountsSummary(counts: Record<string, number> | null | undefined): string {
  const c = counts || {};
  const parts: string[] = [];
  const add = (n: unknown, one: string, many: string) => {
    const v = typeof n === "number" ? n : 0;
    if (v > 0) parts.push(`${v} ${v === 1 ? one : many}`);
  };
  add(c.cases_fetched, "case on file", "cases on file");
  add(c.matters_seeded, "from your cause list", "from your cause list");
  add(c.enriched, "detailed", "detailed");
  add(c.deadlines_proposed, "deadline", "deadlines");
  return parts.join(" · ");
}
