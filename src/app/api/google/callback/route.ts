import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, adminFor } from "@/lib/supabase/admin";
import { exchangeCode, GMAIL_SCOPE } from "@/lib/mail/oauth";
import { getTenantId } from "@/lib/court/sync";
import { storeSecret } from "@/lib/mail/vault";
import { requestOrigin } from "@/lib/auth/redirects";

export const dynamic = "force-dynamic";

// Google redirects here after consent. Exchange the code, store the refresh
// token encrypted in Vault, and record the oauth_connection.
// WO-341: origin from requestOrigin(), never new URL(request.url).origin (resolves
// to internal localhost:3000 behind the WO-323 self-host edge).
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = requestOrigin(request.headers);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const cookieState = request.cookies.get("g_oauth_state")?.value;

  const fail = (msg: string) =>
    NextResponse.redirect(`${origin}/dashboard/inbox?error=${encodeURIComponent(msg)}`);

  if (!code || !state || !cookieState || state !== cookieState) return fail("Invalid OAuth state");

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const tenantId = await getTenantId(supabase);
  if (!tenantId) return fail("No tenant");

  let tokens;
  try {
    tokens = await exchangeCode(code);
  } catch {
    return fail("Token exchange failed");
  }
  if (!tokens.refresh_token) {
    return fail("No refresh token returned — revoke access in your Google account and reconnect");
  }

  const admin = createAdminClient();
  const ref = await storeSecret(admin, tokens.refresh_token, `gmail:${tenantId}:${user.id}`);
  if (!ref) return fail("Could not store credential");

  const scoped = adminFor(tenantId, admin);
  // Upsert the connection (one Google connection per user/tenant).
  await scoped
    .from("oauth_connection")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", "google");
  await scoped.from("oauth_connection").insert({
    user_id: user.id,
    provider: "google",
    scopes: [GMAIL_SCOPE],
    refresh_token_ref: ref,
    status: "active",
  });
  await scoped.from("audit_event").insert({
    actor_id: user.id,
    action: "gmail.connect",
    entity: "oauth_connection",
  });

  const res = NextResponse.redirect(`${origin}/dashboard/inbox?connected=1`);
  res.cookies.delete("g_oauth_state");
  return res;
}
