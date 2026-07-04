// WO-36 · Shared env resolution for the E2E suite. Creds come from E2E_* (aliased to the demo
// DEMO_* vars). Without them the whole authed suite SKIPS cleanly (green, not errored) — the gate
// lights up the moment CI/local provides demo-tenant creds against a DEMO_MODE=1 env.

export const E2E_EMAIL = process.env.E2E_EMAIL || process.env.DEMO_EMAIL || "";
export const E2E_EMAIL2 = process.env.E2E_EMAIL2 || process.env.DEMO_EMAIL2 || "";
export const E2E_PASSWORD = process.env.E2E_PASSWORD || process.env.DEMO_PASSWORD || "";

/** True when advocate creds are available — authed specs skip when false. */
export const HAS_CREDS = Boolean(E2E_EMAIL && E2E_PASSWORD);
export const NO_CREDS_REASON =
  "Set E2E_EMAIL + E2E_PASSWORD (demo-tenant creds against a DEMO_MODE=1 env) to run authed E2E specs.";

// Dynamic-route seeding (WO-36 P1). E2E_ROUTE_IDS is a JSON map of param-name → concrete id, e.g.
//   E2E_ROUTE_IDS='{"id":"<matter-uuid>","judgeId":"<uuid>","barId":"12345"}'
// A dynamic route is exercised ONLY when EVERY one of its params has a seed — otherwise it skips
// (we never invent a random id, which would 404/redirect and produce a false failure). The demo
// seed (WO-08) is the natural source of these ids.
export const ROUTE_IDS: Record<string, string> = (() => {
  try {
    const v = JSON.parse(process.env.E2E_ROUTE_IDS || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
})();

// Resolve a dynamic template like "/dashboard/cases/[id]" or "/dashboard/advocate/[...barId]" to a
// concrete URL using ROUTE_IDS. Returns null when any required param is unseeded (→ the spec skips).
export function seededUrl(template: string, params: string[]): string | null {
  let url = template;
  for (const p of params) {
    const id = ROUTE_IDS[p];
    if (!id) return null;
    url = url.replace(new RegExp(`\\[(\\.\\.\\.)?${p}\\]`), encodeURIComponent(id));
  }
  return url.includes("[") ? null : url;
}

export const ADVOCATE_STATE = "playwright/.auth/advocate.json";
export const JUNIOR_STATE = "playwright/.auth/junior.json";
// Empty Playwright storageState — written so the chromium project never errors on a missing file
// when auth is skipped (no creds). Authed specs skip via HAS_CREDS, so an empty session is never used.
export const EMPTY_STATE = { cookies: [], origins: [] };
