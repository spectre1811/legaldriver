// WO-190/WO-289 · The single shared seam for resolving the LegalDriver internal API base URL.
//
// FAIL CLOSED: there is NO hardcoded prod-IP fallback. A missing LD_API_BASE is a configuration
// error surfaced loudly at call time — never a silent default to a raw origin IP, which (a) rots
// the day the box IP changes and (b) bakes an origin IP into the app. CI/Vercel set the env; a
// deploy without it fails fast with a clear message instead of talking to a ghost.
//
// Every LD API consumer (`legaldriver.ts`'s keyed sync client, `legaldriver-api.ts`'s direct-read
// helpers) resolves the base through THIS one function, so the fail-closed contract can't drift
// per-file (WO-190 residue: 5 files each hand-rolled `|| "http://13.202.148.71:8080"`).
export function resolveLdApiBase(): string {
  const base = process.env.LD_API_BASE;
  if (!base) {
    throw new Error(
      "LD_API_BASE is not set — refusing to consume court data with no configured API base (fail-closed, WO-190/WO-289).",
    );
  }
  return base;
}

/** Console-surface fetch budget (peshi's value) — under Vercel's function cap, so a dead/slow
 *  upstream degrades to an honest bounded error instead of a 60s hang (WO-289). Read-through
 *  search/directory/stats calls use this; the live-eCourts case-sync path (`legaldriver.ts`'s
 *  `req()`) keeps its own longer budget — a live provider hop legitimately needs more headroom. */
export const LD_CONSOLE_FETCH_TIMEOUT_MS = 8000;
