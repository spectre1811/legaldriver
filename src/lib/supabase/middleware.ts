import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/db/database.types";
import { postAuthPath } from "@/lib/auth/redirects";

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

  // Treat only email-CONFIRMED users as authenticated for app access. This blocks
  // unverified sign-ups from using the product even if a session exists, cutting
  // fake registrations (defense-in-depth on top of Supabase's confirmation flow).
  const confirmed = Boolean(user && (user.email_confirmed_at || user.confirmed_at));

  if ((isProtected || isPortalRoute) && !confirmed) {
    // Remember where they were headed so /login can send them back (?next= — WO-50).
    const dest = request.nextUrl.pathname + request.nextUrl.search;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (dest !== "/dashboard") url.searchParams.set("next", dest);
    // i18n code, not prose — the login page renders translated copy (EN+HI).
    if (user && !confirmed) url.searchParams.set("notice", "confirmEmail");
    return NextResponse.redirect(url);
  }

  // Route by user kind: portal users live under /portal, firm users under /dashboard.
  if (confirmed && user) {
    const { data: portal } = await supabase.from("portal_user").select("id").eq("id", user.id).maybeSingle();
    const isPortal = Boolean(portal);
    const go = (p: string) => {
      const url = request.nextUrl.clone();
      url.pathname = p;
      url.search = "";
      return NextResponse.redirect(url);
    };
    if (isPortal && (isProtected || path === "/login" || path === "/")) return go("/portal");
    if (!isPortal && path === "/login") {
      // Already signed in at the front door: honour the deep-link intent
      // (?next= / ?track=<CNR>) instead of dropping it (WO-50/WO-51).
      const dest = postAuthPath(
        request.nextUrl.searchParams.get("next"),
        request.nextUrl.searchParams.get("track"),
      );
      return NextResponse.redirect(new URL(dest, request.url));
    }
    if (!isPortal && isPortalRoute) return go("/dashboard");
  }

  void isAuthRoute;
  return response;
}
