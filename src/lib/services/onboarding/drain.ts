// BP-73: the PURE, offline-testable control logic behind resumable onboarding. Kept free of Supabase/
// court IO (mirrors progress.ts) so the stage-ordering, enrich-chunking, budget-stop and resume
// arithmetic are unit-tested deterministically. The IO stage handlers + persistence live in
// orchestrator.ts, which drives this loop.

export interface OnboardingCounts {
  causelist: number; cases_fetched: number; matters_seeded: number; enriched: number;
  deadlines_proposed: number; inbox_filed: number; docs_attached: number; closed_found: number; summaries_queued: number;
}

export function emptyCounts(): OnboardingCounts {
  return { causelist: 0, cases_fetched: 0, matters_seeded: 0, enriched: 0, deadlines_proposed: 0, inbox_filed: 0, docs_attached: 0, closed_found: 0, summaries_queued: 0 };
}

// Coerce a persisted `counts` JSON (any shape) back into a full OnboardingCounts so resuming a run
// across invocations never loses a tally or trips on a missing key.
export function normalizeCounts(raw: unknown): OnboardingCounts {
  const c = emptyCounts();
  const src = (raw ?? {}) as Record<string, unknown>;
  for (const k of Object.keys(c) as (keyof OnboardingCounts)[]) {
    const v = src[k];
    if (typeof v === "number" && Number.isFinite(v)) c[k] = v;
  }
  return c;
}

// enrich does LIVE per-CNR eCourts read-throughs — the stage that historically pushed a large roster
// past Vercel Hobby's 60s server-action cap. Process it in small cursor-tracked chunks so no single
// drain invocation runs them all at once, and so it paces the source. Kept SMALL (3) because the budget
// is only checked BETWEEN chunks — one chunk of live reads must comfortably fit in the headroom left
// under the 60s function cap (3 live reads « 60s guarantees forward progress every invocation).
export const ENRICH_CHUNK = 3;

// Default per-invocation wall-clock budget for the interactive path (client action, 60s cap). The
// budget gates STARTING a new unit, so it must leave room for one more (possibly slow, live) unit to
// finish under the cap: 35s budget + a ≤3-read enrich chunk stays well under 60s. The cron backstop
// passes an even smaller budget (its 60s function cap is shared across several runs per tick).
export const DRAIN_BUDGET_MS = 35_000;

// The working stages in execution order (terminal "done" excluded). Mirrors progress.ts
// ONBOARDING_STAGES and the setRun labels the UI polls.
export const PIPELINE_STAGES = ["causelist", "fetch", "enrich", "deadlines", "inbox", "closed", "summaries"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

// The next stage after `stage` ("done" once the pipeline is exhausted). "queued"/unknown → the first
// stage, so a freshly-inserted run (stage 'queued') resumes at the top.
export function nextStage(stage: string): string {
  if (stage === "done") return "done";
  const i = (PIPELINE_STAGES as readonly string[]).indexOf(stage);
  if (i < 0) return PIPELINE_STAGES[0];           // queued / unknown → start
  return i + 1 < PIPELINE_STAGES.length ? PIPELINE_STAGES[i + 1] : "done";
}

// Pure enrich-chunk plan: the slice of CNRs to process this call + whether more remain.
export function enrichChunk(cnrs: string[], offset: number, size = ENRICH_CHUNK): { chunk: string[]; nextOffset: number; more: boolean } {
  const start = Math.max(0, offset);
  const chunk = cnrs.slice(start, start + size);
  const nextOffset = start + chunk.length;
  return { chunk, nextOffset, more: nextOffset < cnrs.length };
}

// Carry the fetch-stage's async-refresh flags across a stage advance (they're informational — "still
// fetching…" — and must survive the per-stage cursor reset the enrich chunker uses).
export function preserveFetch(cursor: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (cursor.fetch_pending !== undefined) out.fetch_pending = cursor.fetch_pending;
  if (cursor.fetch_started_at !== undefined) out.fetch_started_at = cursor.fetch_started_at;
  return out;
}

// ── The resumable state carried across drain invocations (mirrors the onboarding_run row). ──
export interface DrainState {
  stage: string;
  cursor: Record<string, unknown>;
  counts: OnboardingCounts;
  message: string | null;
}

// One stage's outcome: updated counts/cursor + `more` (true → same stage, run me again for the next
// chunk) + an optional honest `message` to persist (the fetch stage's note).
export interface StepResult {
  counts: OnboardingCounts;
  cursor: Record<string, unknown>;
  more: boolean;
  message?: string | null;
}

export type StepFn = (stage: string, state: DrainState) => Promise<StepResult>;

// ── Pure control loop (no Supabase/court IO — injected via `step`/`now`/`persist`). ──
// Advances stages from state.stage, looping within a stage while step returns `more`, checking the
// wall-clock budget BETWEEN steps so a drain always returns before the 60s cap. Persists after every
// unit (via `persist`) so a return (or a platform kill) is always resumable from the exact stage+cursor.
// Deterministic given `now` + `step`, which is what the offline test exercises.
export async function driveDrain(
  initial: DrainState,
  step: StepFn,
  opts: { budgetMs: number; now: () => number; persist: (s: DrainState, done: boolean) => Promise<void> },
): Promise<{ state: DrainState; done: boolean }> {
  const started = opts.now();
  const timeLeft = () => opts.budgetMs - (opts.now() - started);
  let cur: DrainState = { ...initial };
  if (cur.stage === "queued" || !cur.stage) cur = { ...cur, stage: PIPELINE_STAGES[0] };

  while (cur.stage !== "done" && timeLeft() > 0) {
    const res = await step(cur.stage, cur);
    const message = res.message !== undefined ? res.message : cur.message;
    if (res.more) {
      // Same stage, more chunks — persist progress and continue if budget remains.
      cur = { ...cur, counts: res.counts, cursor: res.cursor, message };
      await opts.persist(cur, false);
      continue;
    }
    // Stage complete → advance; drop the per-stage cursor (keep the fetch flags).
    cur = { ...cur, counts: res.counts, cursor: preserveFetch(res.cursor), stage: nextStage(cur.stage), message };
    await opts.persist(cur, cur.stage === "done");
  }
  return { state: cur, done: cur.stage === "done" };
}
