// WO-147 W4 · onboarding stepper progress is derived from real state only — never a
// fabricated step. Pure/offline. Run: npx tsx tests/wo147_onboarding_stepper.ts
import { onboardingStep } from "../src/app/dashboard/onboarding/step-state";

let failures = 0;
const check = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failures++; };

check("no advocate → step 0 (Bar ID)", onboardingStep(false, 0) === 0);
check("no advocate, even with stray cases → step 0", onboardingStep(false, 5) === 0);
check("advocate added, no cases yet → step 1 (fetching)", onboardingStep(true, 0) === 1);
check("advocate + cases on file → step 2 (assembled)", onboardingStep(true, 3) === 2);
check("never returns beyond the 3 steps", [onboardingStep(false, 0), onboardingStep(true, 0), onboardingStep(true, 9)].every((s) => s >= 0 && s <= 2));

console.log(failures === 0 ? "\n✅ all wo147 stepper checks passed" : `\n❌ ${failures} failing`);
process.exit(failures === 0 ? 0 : 1);
