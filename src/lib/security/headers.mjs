// WO-316 W1 · the single source of truth for the app's HTTP security headers.
//
// `next.config.mjs` consumes this in `headers()`; `tests/wo316_session_security.ts`
// imports the SAME functions and asserts on the produced values — so the gate is a
// behavioural check on real header objects, not a grep over the config source.
// Plain `.mjs` on purpose: next.config.mjs is loaded by Node before any TS toolchain
// exists, so a `.ts` module could not be shared with it.

/** @typedef {{ key: string, value: string }} HttpHeader */

// One year, subdomains included. NO `preload` — preload-list submission is a
// hard-to-reverse, whole-apex commitment (mukadma.in also serves api./search.),
// so it stays a founder decision, not a side effect of this wave.
export const HSTS_VALUE = "max-age=31536000; includeSubDomains";

/** Referrer that keeps the origin for our own analytics but never leaks a path off-site. */
export const REFERRER_POLICY = "strict-origin-when-cross-origin";

/**
 * The Supabase origin this deployment talks to, so CSP `connect-src` names the real
 * host rather than only a wildcard. Returns null when the env var is absent/garbage.
 * @param {string | undefined} url
 * @returns {string | null}
 */
export function supabaseOrigin(url) {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * The policy we INTEND to enforce. Shipped report-only in this wave (WO-316 W1) so
 * violations surface before anything breaks; enforcement is a later, separate flip.
 *
 * Deliberate notes:
 *  - `script-src` still needs 'unsafe-inline'/'unsafe-eval': Next 14's App Router
 *    inlines bootstrap/flight payloads and we have no nonce plumbing yet. Removing
 *    them is the work the report-only phase is meant to size.
 *  - `frame-ancestors` is OMITTED: browsers ignore it in a report-only policy and
 *    log a console warning on every page. Framing is denied by X-Frame-Options
 *    until the policy is enforced, at which point frame-ancestors 'none' lands too.
 *
 * @param {string | undefined} [supabaseUrl]
 * @returns {string}
 */
export function contentSecurityPolicy(supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL) {
  const origin = supabaseOrigin(supabaseUrl);
  const connect = ["'self'", "https://*.supabase.co", "wss://*.supabase.co"];
  if (origin && !connect.includes(origin)) {
    connect.push(origin, origin.replace(/^https:/, "wss:"));
  }
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connect.join(" ")}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "frame-src 'self' blob: https://*.supabase.co",
  ].join("; ");
}

/**
 * Every response gets these. Order is irrelevant to browsers; kept stable for tests.
 * @param {Record<string, string | undefined>} [env]
 * @returns {HttpHeader[]}
 */
export function securityHeaders(env = process.env) {
  return [
    { key: "Strict-Transport-Security", value: HSTS_VALUE },
    // DENY, not SAMEORIGIN: nothing in the app is meant to be framed. The document
    // preview iframe points at /api/documents/:id/download, which 302s to a signed
    // Supabase URL — browsers evaluate X-Frame-Options on the FINAL response, so the
    // preview is unaffected. The order-PDF proxy opens in a new tab, not a frame.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: REFERRER_POLICY },
    { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy(env.NEXT_PUBLIC_SUPABASE_URL) },
  ];
}
