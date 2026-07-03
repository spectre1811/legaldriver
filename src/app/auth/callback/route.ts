import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";

// Handles the redirect after email confirmation or OAuth (Google) sign-in.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
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
      }
      return res;
    }
  }
  return NextResponse.redirect(`${origin}/login?error=Could not sign in`);
}
