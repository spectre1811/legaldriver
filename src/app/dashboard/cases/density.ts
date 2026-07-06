// WO-54 W4 · Cases-list density preference (per-user, cookie-persisted). Pure + shared by the server
// page (reads the cookie → correct first paint, no hydration flash) and the client table (writes it),
// mirroring the app's cookie-resolved locale pattern. No DB migration — device-scoped preference.
export type Density = "comfortable" | "cozy" | "compact";
export const DENSITIES: Density[] = ["comfortable", "cozy", "compact"];
export const DENSITY_COOKIE = "cases_density";
export const DEFAULT_DENSITY: Density = "cozy";

export function isDensity(v: unknown): v is Density {
  return typeof v === "string" && (DENSITIES as string[]).includes(v);
}

export function parseDensity(v: unknown): Density {
  return isDensity(v) ? v : DEFAULT_DENSITY;
}
