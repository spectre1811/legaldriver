import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { sanitizeNext } from "@/lib/auth/redirects";
import { track } from "@/lib/analytics/track"; // WO-184 user-lifecycle

// Handles the redirect after email confirmation, password recovery or OAuth
// (Google) sign-in. WO-50: failures land on a VISIBLE error page with retry —
// never a silent bounce back to /login (that was an invisible redirect loop).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitizeNext(searchParams.get("next")) ?? "/dashboard";

  const errorPage = (reason: "provider" | "missing" | "exchange") => {
    const q = new URLSearchParams({ reason });
    if (next !== "/dashboard") q.set("next", next);
    return NextResponse.redirect(`${origin}/auth/error?${q.toString()}`);
  };

  // Upstream (Google/GoTrue) refused before a code was ever issued — GoTrue
  // forwards ?error/&error_description. Don't log the description (may echo PII).
  if (searchParams.get("error")) return errorPage("provider");
  if (!code) return errorPage("missing");

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return errorPage("exchange");

  const res = NextResponse.redirect(`${origin}${next}`);
  // Seed the UI locale from the user's stored preference so the first authed
  // render uses their language (profile.locale is the durable source; cookie
  // is the per-request fast path). WO-03.
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: prof } = await supabase.from("profile").select("locale").eq("id", user.id).maybeSingle();
    if (prof?.locale && isLocale(prof.locale)) {
      res.cookies.set(LOCALE_COOKIE, prof.locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    }
    // WO-184 lifecycle. This callback fronts three flows; split by intent:
    //  • password recovery (next=/reset-password) → not a login/registration → fire nothing.
    //  • email-confirmation link → provider "email", fires exactly once → registration_completed.
    //  • OAuth (Google) return → always a login; a brand-new account is also a registration.
    if (next !== "/reset-password") {
      const provider = user.app_metadata?.provider;
      if (provider === "email") {
        track("registration_completed", user.id, { method: "email" });
      } else {
        // First OAuth sign-in ≈ account just created (created_at within a minute of now).
        // ponytail: 60s created_at heuristic for first-vs-returning OAuth; upgrade to a real
        // "first session" flag if the split ever needs to be exact.
        if (Date.now() - new Date(user.created_at).getTime() < 60_000) {
          track("registration_completed", user.id, { method: "oauth" });
        }
        track("login", user.id, { method: "oauth" });
      }
    }
  }
  return res;
}
