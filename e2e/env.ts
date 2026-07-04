// WO-36 · Shared env resolution for the E2E suite. Creds come from E2E_* (aliased to the demo
// DEMO_* vars). Without them the whole authed suite SKIPS cleanly (green, not errored) — the gate
// lights up the moment CI/local provides demo-tenant creds against a DEMO_MODE=1 env.

export const E2E_EMAIL = process.env.E2E_EMAIL || process.env.DEMO_EMAIL || "";
export const E2E_EMAIL2 = process.env.E2E_EMAIL2 || process.env.DEMO_EMAIL2 || "";
export const E2E_PASSWORD = process.env.E2E_PASSWORD || process.env.DEMO_PASSWORD || "";

/** True when advocate creds are available — authed specs skip when false. */
export const HAS_CREDS = Boolean(E2E_EMAIL && E2E_PASSWORD);
export const NO_CREDS_REASON =
  "Set E2E_EMAIL + E2E_PASSWORD (demo-tenant creds against a DEMO_MODE=1 env) to run authed E2E specs.";

export const ADVOCATE_STATE = "playwright/.auth/advocate.json";
export const JUNIOR_STATE = "playwright/.auth/junior.json";
// Empty Playwright storageState — written so the chromium project never errors on a missing file
// when auth is skipped (no creds). Authed specs skip via HAS_CREDS, so an empty session is never used.
export const EMPTY_STATE = { cookies: [], origins: [] };
