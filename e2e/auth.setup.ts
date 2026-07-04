import { test as setup, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  E2E_EMAIL,
  E2E_EMAIL2,
  E2E_PASSWORD,
  HAS_CREDS,
  NO_CREDS_REASON,
  ADVOCATE_STATE,
  JUNIOR_STATE,
  EMPTY_STATE,
} from "./env";

// WO-36 · Auth setup — log in once per role through the REAL /login path, then persist the session
// so every spec starts already signed in (fast + faithful to how a human uses the app). Two roles:
//   advocate → playwright/.auth/advocate.json   (E2E_EMAIL / E2E_PASSWORD, a.k.a. DEMO_EMAIL / DEMO_PASSWORD)
//   junior   → playwright/.auth/junior.json     (E2E_EMAIL2, optional — for RLS/role-scoped specs)
// Guardrail: these must be DEMO-tenant creds against a DEMO_MODE=1 env (the suite clicks real actions).

// Always leave a valid (possibly empty) state file so the chromium project never errors on a missing
// path when auth is skipped. Authed specs gate on HAS_CREDS, so an empty session is never exercised.
mkdirSync("playwright/.auth", { recursive: true });
writeFileSync(ADVOCATE_STATE, JSON.stringify(EMPTY_STATE));
writeFileSync(JUNIOR_STATE, JSON.stringify(EMPTY_STATE));

async function signIn(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // Success = redirect off /login into the app. A wrong-cred attempt renders role="alert" on /login.
  await page.waitForURL(/\/dashboard(\/|$)/, { timeout: 20_000 }).catch(() => {});
  const alert = page.getByRole("alert");
  if (await alert.count()) {
    throw new Error(`Login failed for ${email}: ${(await alert.first().innerText()).trim()}`);
  }
  await expect(page, "expected redirect to /dashboard after sign-in").toHaveURL(/\/dashboard(\/|$)/);
}

setup("authenticate advocate", async ({ page }) => {
  setup.skip(!HAS_CREDS, NO_CREDS_REASON);
  await signIn(page, E2E_EMAIL, E2E_PASSWORD);
  await page.context().storageState({ path: ADVOCATE_STATE });
});

setup("authenticate junior", async ({ page }) => {
  setup.skip(!E2E_EMAIL2 || !E2E_PASSWORD, "Set E2E_EMAIL2 to enable the junior/second-role session (optional).");
  await signIn(page, E2E_EMAIL2, E2E_PASSWORD);
  await page.context().storageState({ path: JUNIOR_STATE });
});
