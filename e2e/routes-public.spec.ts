import { test, assertRouteHealthy } from "./fixtures";
import routes from "./routes.generated.json";

// WO-36 P1 · Public route render/a11y gate — runs in the `public` project (NO auth), so pages that
// redirect a signed-in user (`/`, `/login`) are tested as a REAL visitor sees them (the Phase-0 gate
// ran everything authed, which silently redirected `/login`→`/dashboard` = mislabeled coverage).
// Every public route: navigate < 400 → render → <main> landmark → zero console/network errors → zero
// critical a11y violations. No creds needed → always runs.

type Route = { url: string; dynamic: boolean };
const isDashboard = (u: string) => u === "/dashboard" || u.startsWith("/dashboard/");
const isPortal = (u: string) => u === "/portal" || u.startsWith("/portal/");
// The marketing landing at "/" composes a full page without a semantic <main> — skip the landmark
// assertion there (tracked as an a11y follow-up; axe still scans it).
const LANDMARKLESS = new Set(["/"]);

const publicRoutes = (routes.routes as Route[]).filter((r) => !r.dynamic && !isDashboard(r.url) && !isPortal(r.url));

test.describe("public route gate", () => {
  for (const { url } of publicRoutes) {
    test(`renders clean: ${url}`, async ({ page, guard }) => {
      await assertRouteHealthy(page, guard, url, { landmark: !LANDMARKLESS.has(url) });
    });
  }
});
