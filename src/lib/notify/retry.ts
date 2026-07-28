// WO-288 (e): bounded retry for transiently-failed notification rows. Pure so the
// money branch is unit-tested (tests/wo288_email_sendpath.ts); the cron route
// applies the result fail-soft (a pre-migration schema without `attempts`/'dead'
// falls back to today's plain 'failed' flip).

export const MAX_SEND_ATTEMPTS = 5;

export type RetryPlan = {
  status: "failed" | "dead";
  attempts: number;
  /** Next pickup time (2^attempts hours); absent when terminal. */
  scheduled_for?: string;
};

export function retryPlan(attemptsSoFar: number | null | undefined, now = new Date()): RetryPlan {
  const attempts = (attemptsSoFar ?? 0) + 1; // NULL (mid-migration shape) = first recorded attempt
  if (attempts >= MAX_SEND_ATTEMPTS) return { status: "dead", attempts };
  return {
    status: "failed",
    attempts,
    // With the daily cron this is effectively "next run" for early attempts; the
    // bound is what matters, the backoff keeps it honest if cadence ever tightens.
    scheduled_for: new Date(now.getTime() + 2 ** attempts * 3_600_000).toISOString(),
  };
}
