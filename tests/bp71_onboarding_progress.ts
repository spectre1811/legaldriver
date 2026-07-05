// BP-71 W2: the pure onboarding progress-bar model (stage → percent/label + a counts summary).
// Offline, no secrets. Run: npx tsx tests/bp71_onboarding_progress.ts
import { onboardingProgress, onboardingCountsSummary, ONBOARDING_STAGES } from "../src/lib/services/onboarding/progress";

let failures = 0;
const check = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failures++; };

// stage → label + a visibly-advancing percent
const causelist = onboardingProgress("causelist", "running");
check("causelist labelled + advancing + not done", causelist.label === "Reading your cause list" && causelist.percent > 0 && !causelist.done && !causelist.error);
check("fetch stage labelled", onboardingProgress("fetch", "running").label === "Fetching your cases");
check("enrich stage labelled", onboardingProgress("enrich", "running").label === "Enriching case details");

// done → 100% + done flag
const done = onboardingProgress("done", "done");
check("done → 100% + done", done.done && done.percent === 100 && !done.error);

// error (from status OR stage) → error flag, never throws
check("status=error → error flag", onboardingProgress("enrich", "error").error === true);
check("stage=error → error flag", onboardingProgress("error", "running").error === true);

// queued / unknown degrade to a low, non-zero bar (never NaN / never a stuck 0)
const q = onboardingProgress(null, "running");
check("queued/null → low non-zero percent, not done", q.percent > 0 && q.percent < 50 && !q.done && !q.error);
check("unknown stage degrades to Working…", onboardingProgress("mystery", "running").label === "Working…");

// the bar is monotonic across the real stage order
const pct = (s: string) => onboardingProgress(s, "running").percent;
check("percent strictly increases causelist < enrich < summaries",
  pct("causelist") < pct("enrich") && pct("enrich") < pct("summaries"));
check("all non-terminal stages < 100", ONBOARDING_STAGES.filter((s) => s !== "done").every((s) => pct(s) < 100));

// counts summary: only non-zero tallies, honest singular/plural, empty when nothing yet
check("counts summary shows non-zero tallies", onboardingCountsSummary({ cases_fetched: 12, matters_seeded: 3 }) === "12 cases on file · 3 from your cause list");
check("counts summary singular", onboardingCountsSummary({ cases_fetched: 1 }) === "1 case on file");
check("counts summary empty when nothing seeded yet", onboardingCountsSummary({}) === "" && onboardingCountsSummary(null) === "");
check("counts summary hides zeros", onboardingCountsSummary({ cases_fetched: 0, enriched: 5 }) === "5 detailed");

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
