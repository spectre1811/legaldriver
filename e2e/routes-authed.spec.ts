import { test, assertRouteHealthy } from "./fixtures";
import routes from "./routes.generated.json";
import { HAS_CREDS, NO_CREDS_REASON, seededUrl, ROUTE_IDS } from "./env";

// WO-36 P1 · Authed route render/a11y gate — runs in the `authed` project (advocate storageState).
// Covers every /dashboard route (static) + dynamic routes seeded via E2E_ROUTE_IDS. Skips cleanly
// without demo creds. The client portal needs a separate (client) session → deferred.

type Route = { url: string; dynamic: boolean; params: string[] };
const isDashboard = (u: string) => u === "/dashboard" || u.startsWith("/dashboard/");
const all = routes.routes as Route[];

test.skip(!HAS_CREDS, NO_CREDS_REASON);

test.describe("authed route gate", () => {
  // Static dashboard routes.
  for (const { url, dynamic } of all.filter((r) => !r.dynamic && isDashboard(r.url))) {
    if (dynamic) continue;
    test(`renders clean: ${url}`, async ({ page, guard }) => {
      await assertRouteHealthy(page, guard, url, { landmark: true });
    });
  }

  // Dynamic routes — exercised only when EVERY param is seeded in E2E_ROUTE_IDS (else skip, never a
  // false failure on a made-up id). Demo seed (WO-08) is the id source.
  for (const { url, params } of all.filter((r) => r.dynamic && isDashboard(r.url))) {
    const concrete = seededUrl(url, params);
    if (!concrete) {
      test.skip(`renders clean: ${url} (unseeded — set E2E_ROUTE_IDS: ${params.join(",")})`, () => {});
      continue;
    }
    test(`renders clean: ${url} → ${concrete}`, async ({ page, guard }) => {
      await assertRouteHealthy(page, guard, concrete, { landmark: true });
    });
  }
});

// Surface what's seeded so a run's dynamic coverage is visible in the report, not silent.
test("dynamic-route seeding summary", async () => {
  test.info().annotations.push({ type: "E2E_ROUTE_IDS", description: JSON.stringify(ROUTE_IDS) });
});
