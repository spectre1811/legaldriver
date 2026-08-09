// WO-323 W1 — Turnstile step-up guard for the public /request-access surface. Offline, no network
// on the happy paths (the challenge-verify network call is only reached with a secret + token, which
// these cases avoid). Run: npx tsx tests/wo323_step_up.ts
import { stepUp, __resetStepUp } from "../src/lib/security/step-up";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed++;
}

async function main() {
  // soft default = 5, window 10m.
  __resetStepUp();
  delete process.env.TURNSTILE_SECRET_KEY;

  // The first 5 hits from one IP are within the soft cap.
  let allUnder = true;
  for (let i = 0; i < 5; i++) {
    const r = await stepUp({ ip: "1.2.3.4", action: "request-access" });
    if (!r.ok) allUnder = false;
  }
  ok("under the soft cap → ok (no challenge on the happy path)", allUnder);

  // 6th trips, but with no secret wired the existing controls are the backstop → still ok.
  ok("over cap + no TURNSTILE_SECRET_KEY → ok (backstop)", (await stepUp({ ip: "1.2.3.4", action: "request-access" })).ok);

  // With a secret and no token, a tripped IP must be challenged.
  __resetStepUp();
  process.env.TURNSTILE_SECRET_KEY = "test-secret";
  for (let i = 0; i < 5; i++) await stepUp({ ip: "9.9.9.9", action: "request-access" });
  const challenged = await stepUp({ ip: "9.9.9.9", action: "request-access" });
  ok("over cap + secret + no token → challenge_required", !challenged.ok && challenged.reason === "challenge_required");

  // A different IP starts clean (per-IP bucketing).
  ok("per-IP bucketing: a fresh IP is unaffected", (await stepUp({ ip: "5.5.5.5", action: "request-access" })).ok);
  delete process.env.TURNSTILE_SECRET_KEY;
}

main().then(() => {
  console.log(failed ? `WO-323 STEP-UP: FAIL (${failed})` : "WO-323 STEP-UP: PASS");
  process.exit(failed ? 1 : 0);
});
