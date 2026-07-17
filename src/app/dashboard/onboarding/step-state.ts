// WO-147 W4 — onboarding progress derived from real state ONLY (honesty §7b: never
// fabricate a step the user hasn't reached). Kept JSX-free so it's unit-testable.
// 0 = add a Bar ID · 1 = advocate added, roster still landing · 2 = cases on file.
export function onboardingStep(hasAdvocates: boolean, caseCount: number): 0 | 1 | 2 {
  if (!hasAdvocates) return 0;
  return caseCount > 0 ? 2 : 1;
}
