import { test, expect, expectHealthy } from "./fixtures";
import { HAS_CREDS, NO_CREDS_REASON } from "./env";

// WO-36 Phase 0 · The canonical smoke: a signed-in advocate lands on a working dashboard.
// This is the shortest proof the whole harness works — auth.setup produced a valid session,
// the app boots under DEMO_MODE, and the primary landing renders clean.

test.skip(!HAS_CREDS, NO_CREDS_REASON);

test("advocate dashboard renders clean", async ({ page, guard }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard(\/|$)/); // not bounced back to /login
  await expectHealthy(page);
  expect(guard.consoleErrors, `console errors:\n${guard.consoleErrors.join("\n")}`).toHaveLength(0);
  expect(guard.failedRequests, `failed requests:\n${guard.failedRequests.join("\n")}`).toHaveLength(0);
});
