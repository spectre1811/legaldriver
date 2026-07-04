import { test as base, expect, type Page } from "@playwright/test";

// WO-36 · Shared test fixtures. `guard` collects the two "silent breakage" signals the gate cares
// about — browser console errors and failed network requests — so any spec can assert a page loaded
// cleanly, not just that it rendered something.

export type PageGuard = {
  consoleErrors: string[];
  failedRequests: string[];
};

// Benign console noise to ignore (framework/devtools chatter, not app bugs). Keep this list tight
// and justified — the whole point is to catch real errors.
const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  /React Router Future Flag/i,
];

// Third-party/analytics hosts whose failure is not an app defect (e.g. blocked in CI).
const IGNORED_REQUEST_HOSTS = [/plausible\.io/i, /posthog\.com/i, /googletagmanager/i];

export const test = base.extend<{ guard: PageGuard }>({
  guard: async ({ page }, use) => {
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
      consoleErrors.push(text);
    });
    page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));
    page.on("requestfailed", (req) => {
      const url = req.url();
      if (IGNORED_REQUEST_HOSTS.some((re) => re.test(url))) return;
      failedRequests.push(`${req.method()} ${url} — ${req.failure()?.errorText ?? "failed"}`);
    });
    page.on("response", (res) => {
      if (res.status() >= 500) failedRequests.push(`${res.status()} ${res.url()}`);
    });

    await use({ consoleErrors, failedRequests });
  },
});

export { expect };

// A page is "healthy" when it shows its main landmark and did NOT fall through to the error boundary
// (dashboard/error.tsx renders states.error). Used by the smoke + per-route gate.
export async function expectHealthy(page: Page) {
  await expect(page.locator("main").first(), "page should render a <main> landmark").toBeVisible();
}
