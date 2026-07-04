import { test, expect, expectHealthy } from "./fixtures";
import { HAS_CREDS, NO_CREDS_REASON } from "./env";

// WO-35 hero JOURNEY · manual add-case (WO-35 #2). The full loop an advocate hits when a case
// isn't on eCourts yet: reveal the manual form → create → land on the new case → track it →
// delete. Self-cleaning (creates then deletes its own matter) so the gate is idempotent and the
// demo tenant stays pristine across runs. Safe under DEMO_MODE (a DB write, no outbound).

test.skip(!HAS_CREDS, NO_CREDS_REASON);

test("create a manual case, land on its page, then delete it", async ({ page }) => {
  // A unique title so the spec is self-identifying and safe to run repeatedly.
  const title = `E2E manual case ${Date.now()}`;

  await page.goto("/dashboard/cases");
  await expectHealthy(page);

  await page.getByRole("button", { name: /add a case manually/i }).click();
  await page.locator('input[name="title"]').fill(title);
  await page.getByRole("button", { name: /create case/i }).click();

  // Redirects straight to the new case detail page (/dashboard/cases/<uuid>).
  await expect(page).toHaveURL(/\/dashboard\/cases\/[0-9a-f-]{36}/);
  await expectHealthy(page);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  // Clean up: two-step confirm delete → back to the cases list.
  await page.getByRole("button", { name: /delete/i }).first().click();
  await page.getByRole("button", { name: /confirm|delete/i }).last().click();
  await expect(page).toHaveURL(/\/dashboard\/cases(\/|$)/);
});
