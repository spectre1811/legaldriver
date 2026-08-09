import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signOutScope } from "@/lib/auth/guard";
import { track } from "@/lib/analytics/track"; // WO-184 user-lifecycle
import { requestOrigin } from "@/lib/auth/redirects";

// WO-316 — sign-out now carries a SCOPE. The default stays local (this device
// only, the behaviour every existing sign-out button had). Posting `scope=global`
// revokes every refresh token the user holds, which is the "I think I'm
// compromised" button: it is the only revocation story that exists until W2's
// `sessions_valid_after` lands, so it is explicit and opt-in rather than implied.
export async function POST(request: NextRequest) {
  const supabase = createClient();
  // Read the user id BEFORE signOut clears the session (fire-and-forget; never blocks the redirect).
  const { data: { user } } = await supabase.auth.getUser();

  // The scope travels as a form field (the sign-out controls are plain <form> posts);
  // a query param is accepted too so the path is curl-able. An unreadable/absent body
  // is a normal sign-out, never an accidental global revoke.
  const form = await request.formData().catch(() => null);
  const scope = signOutScope(form?.get("scope") ?? request.nextUrl.searchParams.get("scope"));

  if (user) track("logout", user.id, { scope });
  await supabase.auth.signOut({ scope });
  // WO-329: request.url resolves to the internal localhost:3000 behind the
  // self-hosted Caddy/cloudflared edge — use the forwarded public origin.
  return NextResponse.redirect(new URL("/login", requestOrigin(request.headers)), { status: 303 });
}
