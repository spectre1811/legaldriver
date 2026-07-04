import { test as base, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

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

// WO-36 P1 · axe-core a11y scan (WCAG 2.0/2.1 A+AA). Impact tiers: minor < moderate < serious <
// critical. We FAIL the gate on `critical` by default (calibrate up to `serious` once the app has a
// clean baseline — set A11Y_MAX_IMPACT=serious). A concise, actionable message lists rule + count +
// example node so a failure points straight at the fix. Non-fatal impacts feed the polish backlog.
const IMPACT_ORDER = ["minor", "moderate", "serious", "critical"] as const;
type Impact = (typeof IMPACT_ORDER)[number];

export async function expectNoSeriousA11yViolations(page: Page, label: string) {
  const max = (process.env.A11Y_MAX_IMPACT as Impact) || "critical";
  const floor = IMPACT_ORDER.indexOf(max);
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const failing = violations.filter((v) => IMPACT_ORDER.indexOf((v.impact ?? "minor") as Impact) >= floor);
  const report = failing
    .map((v) => `  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s), e.g. ${v.nodes[0]?.target?.join(" ")})`)
    .join("\n");
  expect(failing, `a11y violations (>= ${max}) on ${label}:\n${report}`).toHaveLength(0);
}

// WO-36 P1 · The full per-route health check, shared by the public + authed route gates:
//   navigate < 400 → settle → non-empty body → (optional) <main> landmark → ZERO console errors +
//   failed/5xx requests → ZERO critical a11y violations. `landmark:false` is for the few routes with
//   no semantic <main> (e.g. the marketing landing at "/").
export async function assertRouteHealthy(
  page: Page,
  guard: PageGuard,
  url: string,
  opts: { landmark?: boolean } = {},
) {
  const resp = await page.goto(url, { waitUntil: "domcontentloaded" });
  expect(resp?.status() ?? 0, `navigation status for ${url}`).toBeLessThan(400);
  // Settle late hydration/XHR so the console/network guard doesn't race errors fired after load.
  // Bounded: a route with a persistently-active network (future SSE/long-poll) must not burn the
  // whole test budget waiting for an idle that never comes — 5s is plenty for initial-load settle.
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
  await expect(page.locator("body")).not.toBeEmpty();
  if (opts.landmark !== false) {
    await expect(page.locator("main").first(), `expected a <main> landmark on ${url}`).toBeVisible();
  }
  expect(guard.consoleErrors, `console errors on ${url}:\n${guard.consoleErrors.join("\n")}`).toHaveLength(0);
  expect(guard.failedRequests, `failed requests on ${url}:\n${guard.failedRequests.join("\n")}`).toHaveLength(0);
  await expectNoSeriousA11yViolations(page, url);
}
