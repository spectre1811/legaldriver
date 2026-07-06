import { test, expect, expectHealthy } from "./fixtures";
import { HAS_CREDS, NO_CREDS_REASON } from "./env";

// WO-59 · Cases tab redesign — verification handoff (ship-grade §8). The build env can't click the
// authed app, so the last-mile checks live here for the QA tester (WO-36) to run with creds:
//   (1) the modern filter bar renders comboboxes, not legacy native <select>s;
//   (2) the status tabs are the semantic axis (All / Open / Disposed);
//   (3) the Attention bar renders, and clicking a bucket filters the list to that urgency
//       (URL gains `?next=…`) and toggles off on a second click.

test.skip(!HAS_CREDS, NO_CREDS_REASON);

test("cases: modern filter bar replaces native selects", async ({ page, guard }) => {
  await page.goto("/dashboard/cases");
  await expectHealthy(page);

  const bar = page.getByTestId("cases-filter-bar");
  await expect(bar).toBeVisible();
  // The legacy dropdowns were native <select>; the modern bar is ARIA comboboxes.
  await expect(bar.locator("select")).toHaveCount(0);
  await expect(bar.getByRole("combobox").first()).toBeVisible();

  expect(guard.consoleErrors, guard.consoleErrors.join("\n")).toHaveLength(0);
});

test("cases: status tabs are All / Open / Disposed", async ({ page }) => {
  await page.goto("/dashboard/cases");
  await expectHealthy(page);
  const tabs = page.getByRole("tablist", { name: /saved views/i });
  await expect(tabs.getByRole("tab", { name: /^All/ })).toBeVisible();
  await expect(tabs.getByRole("tab", { name: /^Open/ })).toBeVisible();
  await expect(tabs.getByRole("tab", { name: /^Disposed/ })).toBeVisible();
});

test("cases: Attention bar filters the list and toggles off", async ({ page }) => {
  await page.goto("/dashboard/cases");
  await expectHealthy(page);

  const attention = page.getByTestId("cases-attention");
  await expect(attention).toBeVisible();

  // Pick whichever urgency bucket the seed produced (overdue > soon > no-date).
  const bucket = page
    .getByTestId(/^attention-(overdue|soon|noDate)$/)
    .first();
  // If the account is genuinely all-clear there are no buckets — that's a valid state, skip the toggle.
  if ((await bucket.count()) === 0) {
    await expect(attention).toContainText(/caught up/i);
    return;
  }

  await bucket.click();
  await expect(page).toHaveURL(/[?&]next=/);
  await expect(bucket).toHaveAttribute("data-active", "true");

  // Clicking the active bucket again clears the urgency filter.
  await bucket.click();
  await expect(page).not.toHaveURL(/[?&]next=/);
});
