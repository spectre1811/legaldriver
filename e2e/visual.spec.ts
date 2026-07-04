import { test, expect } from "./fixtures";
import { HAS_CREDS } from "./env";

// WO-36 Phase 1b · Visual regression baselines for the highest-traffic authed screens. OPT-IN via
// RUN_VISUAL=1 (excluded from the default gate) because baselines are platform-specific: they must be
// GENERATED ON THE CI LINUX RUNNER (`RUN_VISUAL=1 npm run test:e2e:update`) and committed — a macOS
// dev box produces mismatching baselines. Once committed, flip this into the default authed run.
//
// Runs in the `authed` project (advocate storageState). masks time-sensitive/live regions so a
// changing date or freshly-synced value doesn't cause false diffs.

const KEY_ROUTES: Array<[slug: string, url: string]> = [
  ["dashboard", "/dashboard"],
  ["cases", "/dashboard/cases"],
  ["calendar", "/dashboard/calendar"],
  ["documents", "/dashboard/documents"],
  ["clients", "/dashboard/clients"],
  ["settings", "/dashboard/settings"],
];

test.skip(!process.env.RUN_VISUAL, "Set RUN_VISUAL=1 to run visual snapshots (baselines are generated on the CI Linux runner).");
test.skip(!HAS_CREDS, "needs demo advocate creds");

for (const [slug, url] of KEY_ROUTES) {
  test(`visual: ${url}`, async ({ page }) => {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
    await expect(page).toHaveScreenshot(`${slug}.png`, {
      fullPage: true,
      // Live/relative-time text drifts run-to-run; mask it so the baseline stays stable.
      mask: [page.locator("[data-testid='live'], time, .tabular-nums")],
    });
  });
}
