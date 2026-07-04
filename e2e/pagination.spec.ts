import { test, expect, expectHealthy } from "./fixtures";
import { HAS_CREDS, NO_CREDS_REASON } from "./env";

// WO-39 · Scale / pagination gate. Proves the thing the build env can NOT click-test (no demo
// login there): that "Load more" actually returns the NEXT page against real data — the count
// grows, no row 301 silently vanishes, and nothing errors mid-load. Surface-agnostic: it keys off
// the `<PaginatedList>` test hooks (`data-testid="paginated-list"` + `data-row-count` + `data-has-more`
// + `data-testid="paginated-load-more"`), so it covers tables and card lists identically.
//
// Data-volume-safe: a surface with only one page (or none) is NOT a failure — we only assert the
// load-more MECHANISM when the demo tenant actually has a second page. On a richly-seeded demo
// tenant (WO-08) the paginated surfaces exercise the real click; on a thin one they pass cleanly.

test.skip(!HAS_CREDS, NO_CREDS_REASON);

const SURFACES = [
  { name: "cases", url: "/dashboard/cases" },
  { name: "clients", url: "/dashboard/clients" },
  { name: "notices", url: "/dashboard/notices" },
  { name: "voice", url: "/dashboard/voice" },
];

for (const surface of SURFACES) {
  test(`${surface.name}: Load more returns the next page (no silent truncation)`, async ({ page, guard }) => {
    await page.goto(surface.url);
    await expectHealthy(page);

    const list = page.locator('[data-testid="paginated-list"]').first();
    const listCount = await list.count();
    if (listCount === 0) {
      // No paginated list rendered → the tenant has no rows on this surface (empty state).
      // Nothing to paginate; the surface still rendered healthy above.
      test.info().annotations.push({ type: "note", description: `${surface.name}: no rows to paginate (empty)` });
      return;
    }

    const before = Number(await list.getAttribute("data-row-count"));
    expect(before, "a rendered paginated list should report a positive row count").toBeGreaterThan(0);

    const hasMore = (await list.getAttribute("data-has-more")) === "true";
    const loadMore = page.locator('[data-testid="paginated-load-more"]');

    if (!hasMore) {
      // Single page: the load-more button must be ABSENT and the end marker present — i.e. the
      // list honestly says "that's everything", never a dead button or a silent cap.
      await expect(loadMore).toHaveCount(0);
      await expect(page.locator('[data-testid="paginated-end"]').first()).toBeVisible();
      test.info().annotations.push({ type: "note", description: `${surface.name}: single page (${before} rows)` });
      return;
    }

    // There IS a next page → click it and prove the row count grows.
    await expect(loadMore).toBeVisible();
    await loadMore.click();

    await expect
      .poll(async () => Number(await list.getAttribute("data-row-count")), {
        message: "row count should increase after Load more",
        timeout: 10_000,
      })
      .toBeGreaterThan(before);

    // The load itself must be clean — no 5xx, no console error, no failed request.
    expect(guard.consoleErrors, guard.consoleErrors.join("\n")).toHaveLength(0);
    expect(guard.failedRequests, guard.failedRequests.join("\n")).toHaveLength(0);
  });
}
