// WO-50 — post-auth destination resolution + `?next=` / `?track=<CNR>` passthrough.
// Pure functions shared by the login server actions, /auth/callback and the
// middleware front-door redirect (Edge-safe: no Node APIs). Unit-tested in
// tests/wo50_auth_flows.ts.

/**
 * The origin the current request actually arrived on — this is what OAuth and
 * email `redirectTo`s must use, NOT a build-time env var. Root cause of the
 * intermittent "Google fails" report: `APP_BASE_URL ?? localhost` bounced
 * users to localhost (env unset) or to prod from a preview deployment, where
 * the PKCE code_verifier cookie doesn't exist → exchangeCodeForSession fails.
 * Vercel always sets x-forwarded-host/proto; plain `host` covers local dev.
 */
export function requestOrigin(h: Headers): string {
  const first = (v: string | null) => v?.split(",")[0]?.trim() || null;
  const host = first(h.get("x-forwarded-host")) ?? first(h.get("host"));
  if (host) {
    const proto =
      first(h.get("x-forwarded-proto")) ??
      (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https");
    return `${proto}://${host}`;
  }
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}

/** Accept only same-origin path redirects: "/x" but never "//evil", "/\evil" or absolute URLs. */
export function sanitizeNext(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v.startsWith("/")) return null;
  if (v.startsWith("//") || v.startsWith("/\\")) return null;
  if (/[\r\n]/.test(v) || v.includes("://")) return null;
  return v;
}

/** CNR-ish token for the tracked-case deep link (eCourts CNRs are 16 alphanumerics). */
export function sanitizeTrack(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toUpperCase();
  return /^[A-Z0-9-]{6,24}$/.test(v) ? v : null;
}

/**
 * Where to land after a successful sign-in/sign-up/OAuth round-trip.
 * `?track=<CNR>` wins (deep link into add-case-by-CNR, WO-51), then a
 * sanitised `?next=`, then the dashboard.
 */
export function postAuthPath(nextRaw?: string | null, trackRaw?: string | null): string {
  const track = sanitizeTrack(trackRaw);
  if (track) return `/dashboard/cases?track=${encodeURIComponent(track)}`;
  return sanitizeNext(nextRaw) ?? "/dashboard";
}

/**
 * The /auth/callback URL to hand to Supabase (`redirectTo` / `emailRedirectTo`)
 * so the intent survives the OAuth / email-confirmation round-trip.
 */
export function callbackUrl(base: string, nextRaw?: string | null, trackRaw?: string | null): string {
  const dest = postAuthPath(nextRaw, trackRaw);
  const origin = base.replace(/\/$/, "");
  return dest === "/dashboard"
    ? `${origin}/auth/callback`
    : `${origin}/auth/callback?next=${encodeURIComponent(dest)}`;
}

/** Build a /login URL preserving mode + deep-link intent (never leaks emails into the URL). */
export function loginUrl(q: {
  mode?: string | null;
  error?: string | null;
  notice?: string | null;
  next?: string | null;
  track?: string | null;
} = {}): string {
  const p = new URLSearchParams();
  if (q.mode && q.mode !== "signin") p.set("mode", q.mode);
  if (q.error) p.set("error", q.error);
  if (q.notice) p.set("notice", q.notice);
  const next = sanitizeNext(q.next);
  if (next) p.set("next", next);
  const track = sanitizeTrack(q.track);
  if (track) p.set("track", track);
  const s = p.toString();
  return s ? `/login?${s}` : "/login";
}
