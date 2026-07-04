import type { Page } from "@playwright/test";
import { test, expect, type PageGuard } from "./fixtures";
// JSON import (no import-attribute — Playwright's esbuild loader handles JSON natively across Node versions).
import routes from "./routes.generated.json";
import { HAS_CREDS } from "./env";

// WO-36 · Per-route render gate. Data-driven from routes.generated.json (auto-inventoried from
// src/app/**/page.tsx) so EVERY route is covered and a new page is in scope the moment it's added
// + `npm run gen:routes` is re-run. Every route must: navigate < 400, render a non-empty body, and
// produce NO console errors and NO failed/5xx requests — the signals that catch a page that "looks
// fine" but is silently broken.
//
// Phase 0 = render + console/network health. Phase 1 adds: axe-core a11y, visual snapshots, a
// <main>-landmark assertion, and dynamic routes seeded via E2E_ROUTE_IDS.

type Route = { url: string; dynamic: boolean };
const all = routes.routes as Route[];

// Advocate-authed area needs the demo session; the client portal needs a different (client) auth
// we don't set up in Phase 0; everything else is public and testable without creds.
const needsAdvocateAuth = (url: string) => url === "/dashboard" || url.startsWith("/dashboard/");
const isClientPortal = (url: string) => url === "/portal" || url.startsWith("/portal/");

async function assertRendersClean(page: Page, guard: PageGuard, url: string) {
  const resp = await page.goto(url, { waitUntil: "domcontentloaded" });
  expect(resp?.status() ?? 0, `navigation status for ${url}`).toBeLessThan(400);
  await expect(page.locator("body")).not.toBeEmpty();
  expect(guard.consoleErrors, `console errors on ${url}:\n${guard.consoleErrors.join("\n")}`).toHaveLength(0);
  expect(guard.failedRequests, `failed requests on ${url}:\n${guard.failedRequests.join("\n")}`).toHaveLength(0);
}

test.describe("route render gate", () => {
  for (const { url, dynamic } of all) {
    if (dynamic) {
      test.skip(`renders clean: ${url} (dynamic — Phase 1: seed id via E2E_ROUTE_IDS)`, () => {});
      continue;
    }
    if (isClientPortal(url)) {
      test.skip(`renders clean: ${url} (client-portal auth — Phase 1)`, () => {});
      continue;
    }
    test(`renders clean: ${url}`, async ({ page, guard }) => {
      test.skip(needsAdvocateAuth(url) && !HAS_CREDS, "needs demo advocate creds (E2E_EMAIL/E2E_PASSWORD)");
      await assertRendersClean(page, guard, url);
    });
  }
});
