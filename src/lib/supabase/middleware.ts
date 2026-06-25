import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/db/database.types";

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
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    if (user && !confirmed) url.searchParams.set("message", "Please confirm your email — check your inbox — before signing in.");
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
    if (!isPortal && (isPortalRoute || path === "/login")) return go("/dashboard");
  }

  void isAuthRoute;
  return response;
}
