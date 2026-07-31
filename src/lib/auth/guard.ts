// WO-316 W1 · the session gate for `/api` route handlers.
//
// Why this exists: `src/middleware.ts` only guards `/dashboard` and `/portal`.
// Everything under `/api` is reachable anonymously unless the handler says
// otherwise, and two paid-API proxies (`/api/court/judge`, `/api/court/advocate`)
// said nothing at all. `tests/wo316_session_security.ts` keeps that from recurring:
// it inventories every `src/app/api/**/route.ts` and fails on an ungated one.
//
// Deliberately free of `next/*` imports so the offline test can exercise the real
// functions (behaviour, not a source grep) and so `Response` stays the Web standard
// one — App Router accepts a plain `Response` from a route handler.

/** The minimum shape of a Supabase client this guard needs — structural, so a test can stub it. */
export type AuthedClient = {
  auth: { getUser: () => Promise<{ data?: { user?: { id: string } | null } | null } | null> };
};

export type GuardUser = { id: string };

/**
 * The signed-in user, or null. FAIL-CLOSED: a throw, a network blip or an
 * unexpected payload shape all resolve to "not signed in" — never to "allowed".
 */
export async function currentUser(client: AuthedClient): Promise<GuardUser | null> {
  try {
    const res = await client.auth.getUser();
    const user = res?.data?.user;
    return user && typeof user.id === "string" ? user : null;
  } catch {
    return null;
  }
}

/**
 * The one 401 body every gated `/api` route returns. Deliberately contentless —
 * it must not tell a caller whether the resource, the account or the session was
 * the problem (same anti-enumeration rule as the login error).
 */
export function unauthorizedResponse(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

/** Scopes GoTrue accepts on `signOut`. */
export type SignOutScope = "global" | "local";

export type SignOutClient = {
  auth: { signOut(options: { scope: SignOutScope }): Promise<unknown> };
};

/**
 * Revoke EVERY session this account holds — the current one included.
 *
 * Called after a successful password change (WO-316): before this, a stolen cookie
 * survived the very act taken to kill it. Global, not "others", because the recovery
 * flow mints its session from an emailed link — leaving that one alive would keep the
 * link effectively valid. The caller signs in again with the new password, which also
 * proves the change took.
 */
export async function revokeAllSessions(client: SignOutClient): Promise<SignOutScope> {
  await client.auth.signOut({ scope: "global" });
  return "global";
}

/** Where a user lands after a password change, since their session was just revoked. */
export const PASSWORD_CHANGED_DESTINATION = "/login?notice=passwordChanged";

/**
 * "Sign out everywhere" is OPT-IN: a plain sign-out stays local (this device only),
 * and only an explicit `scope=global` (or `all`) revokes every session of the user.
 * Anything else — absent, empty, junk, a File from a multipart form — is local.
 */
export function signOutScope(raw: unknown): SignOutScope {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return v === "global" || v === "all" ? "global" : "local";
}
