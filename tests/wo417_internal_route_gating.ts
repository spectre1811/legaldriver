// WO-417 · /styleguide must not answer anonymously on the production domain — offline, no DB/network.
//
// Guards BOTH directions, because each has a real failure mode:
//   - under-gating  → the internal email design system stays world-readable on the live site
//                     (the bug this WO fixes: 200 with no cookie on mukadma.in/styleguide/comms/email)
//   - OVER-gating   → a prefix that catches a marketing page breaks the public site, or catches
//                     /unsubscribe/[token] and kills the RFC 8058 one-click unsubscribe (WO-416),
//                     or catches /share/case/[token] and kills WO-411's signed share links.
// Run: npx tsx tests/wo417_internal_route_gating.ts

import { requiresInternalAuth } from "../src/lib/supabase/middleware";

let pass = 0;
const fails: string[] = [];
function check(name: string, ok: boolean) {
  if (ok) pass++;
  else fails.push(name);
}

// --- must be gated (internal tooling) -------------------------------------------------
const GATED = [
  "/styleguide",
  "/styleguide/",
  "/styleguide/comms",
  "/styleguide/comms/email",
  "/styleguide/comms/email/",
  "/styleguide/anything/added/later",
];
for (const p of GATED) check(`gated: ${p}`, requiresInternalAuth(p) === true);

// --- must STAY anonymous --------------------------------------------------------------
// Every public page route in src/app, plus the two token-signed routes and the public API.
const PUBLIC = [
  "/",
  "/about",
  "/contact",
  "/for-clients",
  "/why-us",
  "/privacy",
  "/terms",
  "/refund",
  "/cancellation",
  "/data-corrections",
  "/login",
  "/request-access",
  "/reset-password",
  "/auth/error",
  // token-signed, deliberately unauthenticated:
  "/share/case/ec-abc.def",           // WO-411 signed share link
  "/unsubscribe/uo-abc.def",          // WO-416 RFC 8058 one-click — breaking this re-breaks unsubscribe
  // API surfaces that must not be swept up:
  "/api/health",
  "/api/public/search",
  "/api/public/stats",
  "/api/cron/notify",                 // guarded by CRON_SECRET, not by this check
  // gated elsewhere (by isProtected / isPortalRoute), not by this function:
  "/dashboard",
  "/dashboard/cases",
  "/portal",
];
for (const p of PUBLIC) check(`anonymous: ${p}`, requiresInternalAuth(p) === false);

// --- no accidental substring matching -------------------------------------------------
// A naive `path.includes("/styleguide")` or a missing boundary would catch these.
const LOOKALIKES = [
  "/styleguides",                     // different route, must not be gated by a loose prefix
  "/styleguide-archive",
  "/dashboard/styleguide",            // already gated by isProtected; not this function's job
  "/blog/our-styleguide",
];
for (const p of LOOKALIKES) check(`lookalike not gated: ${p}`, requiresInternalAuth(p) === false);

if (fails.length) {
  console.error(`WO-417 INTERNAL ROUTE GATING: FAIL (${fails.length})`);
  for (const f of fails) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`WO-417 INTERNAL ROUTE GATING: PASS (${pass} checks)`);
