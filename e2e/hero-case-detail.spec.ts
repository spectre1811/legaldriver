import { test, expect, expectHealthy } from "./fixtures";
import { HAS_CREDS, NO_CREDS_REASON } from "./env";

// WO-35 hero flow · TRACK surface. Opening a tracked case from the caseload must land on a
// healthy detail page with its tabbed record (overview/court/timeline/…) and the refresh control.
// Render only — refresh itself hits the provider, so we assert the control is present, not that
// it re-syncs.

test.skip(!HAS_CREDS, NO_CREDS_REASON);

test("open a seeded case → detail renders clean with its record + refresh", async ({ page, guard }) => {
  await page.goto("/dashboard/cases");
  await expectHealthy(page);

  await page.locator('a[href^="/dashboard/cases/"]').first().click();
  await expect(page).toHaveURL(/\/dashboard\/cases\/[0-9a-f-]{36}/);
  await expectHealthy(page);

  // The case heading (its title) renders.
  await expect(page.locator("h1").first()).toBeVisible();

  // The tabbed record is present (ARIA tablist with tab controls).
  await expect(page.getByRole("tab").first()).toBeVisible();

  // Refresh control — the "keep it fresh" affordance the daily driver relies on.
  await expect(page.getByRole("button", { name: /refresh/i })).toBeVisible();

  expect(guard.consoleErrors, guard.consoleErrors.join("\n")).toHaveLength(0);
  expect(guard.failedRequests, guard.failedRequests.join("\n")).toHaveLength(0);
});
