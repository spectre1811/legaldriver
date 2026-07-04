import { test, expect, expectHealthy } from "./fixtures";
import { HAS_CREDS, NO_CREDS_REASON } from "./env";

// WO-35 hero flow · Court Search → Directory tab. Two ways in must both be wired: the
// name search (advocate/judge/party) and — the WO-35 #7 fix — search by registration case
// number (type/number/year), which previously existed in the API but reached no UI. Results
// depend on the live corpus provider, so we assert the surfaces render + a search stays healthy,
// not on specific rows.

test.skip(!HAS_CREDS, NO_CREDS_REASON);

test("lookup exposes BOTH name search and case-number search", async ({ page, guard }) => {
  await page.goto("/dashboard/search/directory");
  await expectHealthy(page);

  // Name search.
  await expect(page.locator('input[name="q"]')).toBeVisible();

  // Case-number search (WO-35 #7) — the three registration fields.
  await expect(page.locator('input[name="ct"]')).toBeVisible(); // type
  await expect(page.locator('input[name="cn"]')).toBeVisible(); // number
  await expect(page.locator('input[name="cy"]')).toBeVisible(); // year

  expect(guard.consoleErrors, guard.consoleErrors.join("\n")).toHaveLength(0);
  expect(guard.failedRequests, guard.failedRequests.join("\n")).toHaveLength(0);
});

test("a name search submits and the results page renders clean", async ({ page, guard }) => {
  await page.goto("/dashboard/search/directory");
  await page.locator('input[name="q"]').fill("patel");
  await page.locator('input[name="q"]').press("Enter");

  await expect(page).toHaveURL(/[?&]q=patel/);
  await expectHealthy(page); // results OR empty states — never a crash
  expect(guard.failedRequests, guard.failedRequests.join("\n")).toHaveLength(0);
});
