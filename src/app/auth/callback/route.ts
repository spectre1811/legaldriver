import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { requestOrigin, sanitizeNext } from "@/lib/auth/redirects";
import { track } from "@/lib/analytics/track"; // WO-184 user-lifecycle

// Handles the redirect after email confirmation, password recovery or OAuth
// (Google) sign-in. WO-50: failures land on a VISIBLE error page with retry —
// never a silent bounce back to /login (that was an invisible redirect loop).
// WO-341: origin MUST come from requestOrigin(), not new URL(request.url).origin —
// behind the WO-323 self-host edge the latter resolves to internal localhost:3000,
// bouncing post-Google-auth users to https://localhost:3000/dashboard (ERR_SSL_PROTOCOL_ERROR).
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = requestOrigin(request.headers);
  const code = searchParams.get("code");
  const next = sanitizeNext(searchParams.get("next")) ?? "/dashboard";

  const errorPage = (reason: "provider" | "missing" | "exchange") => {
    const q = new URLSearchParams({ reason });
    if (next !== "/dashboard") q.set("next", next);
    return NextResponse.redirect(`${origin}/auth/error?${q.toString()}`);
  };

  // WO-272 invite-only: a NEW Google user is refused by GoTrue (disable_signup)
  // only after the round-trip — either as a forwarded ?error_description here, or
  // as the exchange error below. That's an expected, meaningful outcome (not a
  // failure to retry), so route it to the login page's invite-only notice with a
  // clear code — never the scary generic error page.
  const signupsDisabled = (s?: string | null) =>
    !!s && /signups?\s+not\s+allowed|signup[_\s]?disabled/i.test(s);
  const inviteOnly = () => NextResponse.redirect(`${origin}/login?error=inviteOnly`);

  // Upstream (Google/GoTrue) refused before a code was ever issued — GoTrue
  // forwards ?error/&error_description. Don't log the description (may echo PII).
  if (searchParams.get("error")) {
    if (signupsDisabled(searchParams.get("error_description"))) return inviteOnly();
    return errorPage("provider");
  }
  if (!code) return errorPage("missing");

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    if (signupsDisabled(error.message)) return inviteOnly();
    return errorPage("exchange");
  }

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
