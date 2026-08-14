import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/db/database.types";
import { postAuthPath, requestOrigin } from "@/lib/auth/redirects";

/**
 * WO-417 — internal (non-product) routes that must never answer anonymously in production.
 *
 * Pure and exported so the gating decision is testable without a request or a Supabase
 * client. Deliberately a prefix ALLOW-list of internal tools, not a deny-list of public
 * paths: the public surface (marketing pages, /login, /request-access, the token-signed
 * /share/case/[token] and RFC 8058 /unsubscribe/[token]) must keep answering anonymously,
 * and a deny-list is the shape that silently breaks one of those when a page is added.
 */
export function requiresInternalAuth(path: string): boolean {
  return path === "/styleguide" || path.startsWith("/styleguide/");
}

// Refreshes the auth session on every request and gates protected routes.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthRoute = path.startsWith("/login") || path.startsWith("/auth");
  const isProtected = path.startsWith("/dashboard");
  const isPortalRoute = path.startsWith("/portal");
  // WO-417: internal tooling must not answer anonymously on the production domain.
  // /styleguide is a design reference (email templates, sample renders) that shipped in
  // WO-148 and has been world-readable ever since — verified 200 with no cookie on
  // https://mukadma.in/styleguide/comms/email. It is NOT folded into `isProtected`: that
  // const also drives the portal-user routing below, and an internal tool is not a
  // product surface. Same confirmed-user bar as /dashboard, so it stays usable for
  // design review while signed in.
  const isInternalTool = requiresInternalAuth(path);

  // Treat only email-CONFIRMED users as authenticated for app access. This blocks
  // unverified sign-ups from using the product even if a session exists, cutting
  // fake registrations (defense-in-depth on top of Supabase's confirmation flow).
  const confirmed = Boolean(user && (user.email_confirmed_at || user.confirmed_at));

  if ((isProtected || isPortalRoute || isInternalTool) && !confirmed) {
    // Remember where they were headed so /login can send them back (?next= — WO-50).
    const dest = request.nextUrl.pathname + request.nextUrl.search;
    // WO-329: build off the request's PUBLIC origin (forwarded host/proto), never
    // request's own cloned URL — behind the self-hosted Caddy/cloudflared edge the
    // request's own host is the internal localhost:3000, which leaked into Location.
    const url = new URL("/login", requestOrigin(request.headers));
    if (dest !== "/dashboard") url.searchParams.set("next", dest);
    // i18n code, not prose — the login page renders translated copy (EN+HI).
    if (user && !confirmed) url.searchParams.set("notice", "confirmEmail");
    return NextResponse.redirect(url);
  }

  // Route by user kind: portal users live under /portal, firm users under /dashboard.
  if (confirmed && user) {
    const { data: portal } = await supabase.from("portal_user").select("id").eq("id", user.id).maybeSingle();
    const isPortal = Boolean(portal);
    const go = (p: string) => NextResponse.redirect(new URL(p, requestOrigin(request.headers)));
    if (isPortal && (isProtected || path === "/login" || path === "/")) return go("/portal");
    if (!isPortal && path === "/login") {
      // Already signed in at the front door: honour the deep-link intent
      // (?next= / ?track=<CNR>) instead of dropping it (WO-50/WO-51).
      const dest = postAuthPath(
        request.nextUrl.searchParams.get("next"),
        request.nextUrl.searchParams.get("track"),
      );
      return NextResponse.redirect(new URL(dest, requestOrigin(request.headers)));
    }
    if (!isPortal && isPortalRoute) return go("/dashboard");
  }

  void isAuthRoute;
  return response;
}
