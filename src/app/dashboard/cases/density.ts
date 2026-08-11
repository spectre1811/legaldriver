// WO-54 W4 · Cases-list density preference. WO-405 C4 (audit §4.4/§10 PRE-4) migrated the
// persistence mechanism off a cookie (4KB budget, sent on every HTTP request for a UI-only
// preference — audit §4.4 verdict) onto the shared `usePersistedState` localStorage hook. The
// server page no longer seeds this from a cookie for first paint; the client hook hydrates it
// right after mount (documented tradeoff — see use-persisted-state.ts's file comment).
// WO-331 EXACT-FIDELITY: the reference (cases.tsx) toggles only "comfortable"/"compact" — the third
// "cozy" middle ground was our own addition, dropped here to match. A stored value that isn't one
// of these (e.g. the old "cozy") just falls back to the default below (parseDensity), never crashes.
export type Density = "comfortable" | "compact";
export const DENSITIES: Density[] = ["comfortable", "compact"];
export const DENSITY_STORAGE_KEY = "mukadma:cases:density";
export const DEFAULT_DENSITY: Density = "comfortable";

export function isDensity(v: unknown): v is Density {
  return typeof v === "string" && (DENSITIES as string[]).includes(v);
}

export function parseDensity(v: unknown): Density {
  return isDensity(v) ? v : DEFAULT_DENSITY;
}
