import { test, expect, expectHealthy } from "./fixtures";
import { HAS_CREDS, NO_CREDS_REASON } from "./env";

// WO-39 · Scale / pagination gate. Proves the thing the build env can NOT click-test (no demo
// login there): that the pager actually pages through the list — Next advances the page and the
// slice changes — and that "showing X–Y of N" + rows-per-page work, with nothing erroring. Keys off
// the SHARED test-id/data-* contract (`data-testid="pagination"` + `data-page` / `data-per-page` /
// `data-total` / `data-total-pages`, `page-next`/`page-prev`, `per-page-select`) — carried by both
// the numbered-page `<Pagination>` (clients/notices/voice) AND, since WO-331, Cases' own
// reference-matched Prev/Go-to/Next control (cases-pagination.tsx): same contract, different shape.
//
// Data-volume-safe: a surface with only one page (or none) is NOT a failure — the multi-page
// assertions run only when the demo tenant actually has a second page.

test.skip(!HAS_CREDS, NO_CREDS_REASON);

const SURFACES = [
  { name: "cases", url: "/dashboard/cases" },
  { name: "clients", url: "/dashboard/clients" },
  { name: "notices", url: "/dashboard/notices" },
  { name: "voice", url: "/dashboard/voice" },
];

for (const surface of SURFACES) {
  test(`${surface.name}: numbered pagination pages through the list`, async ({ page, guard }) => {
    await page.goto(surface.url);
    await expectHealthy(page);

    const pager = () => page.locator('[data-testid="pagination"]').first();
    if ((await pager().count()) === 0) {
      // No rows on this surface → no pager (empty state). Rendered healthy above.
      test.info().annotations.push({ type: "note", description: `${surface.name}: no rows (empty)` });
      return;
    }

    const total = Number(await pager().getAttribute("data-total"));
    expect(total, "a rendered pager should report a positive total").toBeGreaterThan(0);
    // "Showing X–Y of N" is always present.
    await expect(page.locator('[data-testid="pagination-range"]').first()).toBeVisible();

    const totalPages = Number(await pager().getAttribute("data-total-pages"));
    const next = page.locator('[data-testid="page-next"]');

    if (totalPages <= 1) {
      // WO-331: Cases' own pager (matching the reference) always renders Prev/Next, just disabled
      // at the bounds — the other surfaces' numbered <Pagination> omits them entirely when there's
      // nothing to page through. Same test-id contract, two intentionally different single-page
      // treatments.
      if (surface.name === "cases") {
        await expect(next).toBeVisible();
        await expect(next).toBeDisabled();
      } else {
        await expect(next).toHaveCount(0);
      }
      test.info().annotations.push({ type: "note", description: `${surface.name}: single page (${total} rows)` });
      return;
    }

    // Multi-page: Next advances to page 2 (server re-renders with the next slice).
    const startPage = Number(await pager().getAttribute("data-page"));
    await expect(next).toBeVisible();
    await next.click();
    await expect
      .poll(async () => Number(await pager().getAttribute("data-page")), {
        message: "Next should advance the page number",
        timeout: 10_000,
      })
      .toBeGreaterThan(startPage);

    // Rows-per-page: bumping it re-renders and resets to page 1.
    const perSelect = page.locator('[data-testid="per-page-select"]');
    if (await perSelect.count()) {
      await perSelect.selectOption("50");
      await expect
        .poll(async () => Number(await pager().getAttribute("data-per-page")), { timeout: 10_000 })
        .toBe(50);
      expect(Number(await pager().getAttribute("data-page")), "changing page size resets to page 1").toBe(1);
    }

    // Every navigation must be clean — no 5xx, console error, or failed request.
    expect(guard.consoleErrors, guard.consoleErrors.join("\n")).toHaveLength(0);
    expect(guard.failedRequests, guard.failedRequests.join("\n")).toHaveLength(0);
  });
}
