import { test, expect, expectHealthy } from "./fixtures";
import { HAS_CREDS, NO_CREDS_REASON } from "./env";

// WO-35 hero flow · CASES surface (add / browse). The deterministic gate for the daily-driver
// entry point: the add-by-CNR box is present, the "add manually" escape hatch reveals its form
// (WO-35 #2 — add-by-CNR failure must lead somewhere), and the seeded caseload renders as links.
// Render/interaction only — no persistence (the create→delete journey lives in hero-manual-add).

test.skip(!HAS_CREDS, NO_CREDS_REASON);

test("cases page: add-by-CNR box + seeded caseload render clean", async ({ page, guard }) => {
  await page.goto("/dashboard/cases");
  await expectHealthy(page);

  // The primary action — add a case by CNR — is present.
  await expect(page.locator('input[name="cnr"]')).toBeVisible();

  // The demo seed has matters → at least one row links to a case detail page.
  await expect(page.locator('a[href^="/dashboard/cases/"]').first()).toBeVisible();

  expect(guard.consoleErrors, guard.consoleErrors.join("\n")).toHaveLength(0);
  expect(guard.failedRequests, guard.failedRequests.join("\n")).toHaveLength(0);
});

test("cases page: 'add manually' toggle reveals the manual form (WO-35 #2)", async ({ page }) => {
  await page.goto("/dashboard/cases");
  await expectHealthy(page);

  // The manual title field is hidden until the disclosure is opened.
  await expect(page.locator('input[name="title"]')).toHaveCount(0);

  await page.getByRole("button", { name: /add a case manually/i }).click();

  // Now the minimal manual form is visible: title (required) + optional court/type/date.
  await expect(page.locator('input[name="title"]')).toBeVisible();
  await expect(page.locator('input[name="court"]')).toBeVisible();
  await expect(page.locator('input[name="next_hearing_date"]')).toBeVisible();
});
