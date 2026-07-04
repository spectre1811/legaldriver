import { defineConfig, devices } from "@playwright/test";

// WO-36 · Deterministic E2E gate (Layer 1). Runs against a DEMO_MODE=1 env ONLY — the suite logs
// in as the seeded demo tenant, so it must never point at a real tenant. The `webServer` below sets
// DEMO_MODE=1 for the local dev server; in CI, point E2E_BASE_URL at a DEMO_MODE=1 preview/prod and
// the webServer is skipped.
// NOTE: DEMO_MODE is meant to sandbox all outbound (email/WhatsApp/SMS) but that short-circuit is
// NOT yet implemented in the app (see docs/E2E.md). Phase 0 is smoke/render only (never triggers a
// send), so it is safe; Phase-1 send-path specs must wait until the app honors DEMO_MODE.
//
// Env:
//   E2E_BASE_URL   base URL under test (default http://localhost:3000; webServer auto-starts if unset/local)
//   E2E_EMAIL      demo advocate login (a.k.a. DEMO_EMAIL)     — required to run authed specs
//   E2E_PASSWORD   demo password (a.k.a. DEMO_PASSWORD)        — required
//   E2E_EMAIL2     demo junior/second-role login (optional; junior specs skip if unset)
//
// Run: npm run test:e2e | test:e2e:ui | test:e2e:update (snapshots) | gen:routes (refresh inventory)

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const isLocal = BASE_URL.includes("localhost") || BASE_URL.includes("127.0.0.1");
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  // Auth state lives here (git-ignored); specs load it via storageState.
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 30_000,
  expect: {
    timeout: 7_500,
    // Visual baselines (Phase 1): tolerate sub-pixel AA/font noise, catch real drift.
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: "disabled" },
  },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
  },
  projects: [
    // 1) Log in once per role → save storageState. The authed project depends on this.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    // 2) Public routes — NO storageState, so pages that redirect a signed-in user (`/`, `/login`)
    //    are tested as a real visitor sees them. No creds needed → always runs.
    {
      name: "public",
      use: { ...devices["Desktop Chrome"] },
      testMatch: ["routes-public.spec.ts"],
    },
    // 3) Authed app — advocate session; dashboard routes + hero journeys + smoke.
    {
      name: "authed",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/advocate.json",
      },
      testMatch: ["smoke.spec.ts", "hero-*.spec.ts", "routes-authed.spec.ts", "visual.spec.ts"],
    },
  ],
  // Local/CI on localhost: auto-start the app in DEMO_MODE. Command is overridable via
  // E2E_WEBSERVER_CMD (CI uses `npm start` against a prebuilt app; local defaults to `npm run dev`).
  // Against a remote E2E_BASE_URL (a deployed DEMO_MODE preview) the webServer is skipped.
  webServer: isLocal
    ? {
        command: process.env.E2E_WEBSERVER_CMD || "npm run dev",
        url: BASE_URL,
        reuseExistingServer: !isCI,
        timeout: 180_000,
        // DEMO_MODE forced on; the Supabase public env is inherited from the job/shell environment.
        env: { DEMO_MODE: "1" },
      }
    : undefined,
});
