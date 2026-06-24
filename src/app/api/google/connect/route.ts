import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAuthUrl, googleConfigured } from "@/lib/mail/oauth";

export const dynamic = "force-dynamic";

// Start the Gmail connect flow. Requires an authed user; sets a CSRF state cookie.
export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  if (!googleConfigured()) {
    return NextResponse.redirect(
      new URL("/dashboard/inbox?error=Google+OAuth+not+configured+yet", request.url),
    );
  }

  // Random CSRF state, echoed back by Google and verified in the callback.
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(buildAuthUrl(state));
  res.cookies.set("g_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
