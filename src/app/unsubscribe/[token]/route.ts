import { NextResponse, type NextRequest } from "next/server";
import { adminFor } from "@/lib/supabase/admin";
import { verifyUnsubscribeToken } from "@/lib/notify/unsubscribe-token";
import { appUrl } from "@/lib/notify/email-render";
import { brand } from "@/lib/brand";

export const dynamic = "force-dynamic";

// WO-416 · unauthenticated unsubscribe endpoint (RFC 8058). Outside /dashboard and /portal by
// design — middleware.ts only gates those two prefixes, so this route is reachable with no session,
// exactly as a one-click unsubscribe link needs to be. All authority comes from the signed token
// (unsubscribe-token.ts), never a cookie.
//
// GET MUST NOT MUTATE (amendment #2): mail scanners, link prefetchers and antivirus proxies fetch
// the https URL — if a GET flipped the pref, a scanner that merely LOOKED at the message would
// silently unsubscribe the user. GET renders state + an explicit confirm; only POST writes.
//
// POST is the RFC 8058 one-click target (List-Unsubscribe-Post: List-Unsubscribe=One-Click): it
// flips the recipient's notification_prefs.channel_email to false, scoped to the tenant + profile
// the token names (the token is HMAC-signed server-side, so that scope cannot be forged).

const page = (opts: { title: string; body: string; formToken?: string }) => `
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${opts.title}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; background:#FAF9F7; color:#1A1C1E; margin:0; padding:48px 20px; display:flex; justify-content:center; }
  .card { max-width:420px; width:100%; background:#fff; border:1px solid #E7E1D6; border-radius:14px; padding:32px 28px; }
  h1 { font-family: Georgia, "Times New Roman", serif; font-size:22px; margin:0 0 12px; }
  p { font-size:14px; line-height:1.55; color:#4A4A45; margin:0 0 20px; }
  .btn { display:inline-block; background:#1A1C1E; color:#fff; border:0; border-radius:8px; padding:11px 18px; font-size:14px; cursor:pointer; text-decoration:none; }
  .muted { font-size:12px; color:#8B8578; margin-top:18px; }
</style>
</head>
<body>
  <div class="card">
    <h1>${opts.title}</h1>
    <p>${opts.body}</p>
    ${opts.formToken ? `<form method="POST"><button class="btn" type="submit">Unsubscribe from email</button></form>` : ""}
    <p class="muted">${brand.name} — <a href="${appUrl("/dashboard/settings")}" style="color:#78582B;">manage email notifications in Settings</a>.</p>
  </div>
</body>
</html>
`;

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const result = verifyUnsubscribeToken(params.token);
  if (!result.ok || result.channel !== "email") {
    return new NextResponse(
      page({
        title: "This link is invalid",
        body: "Your unsubscribe link couldn't be verified. You can manage email notifications from your Mukadma settings.",
      }),
      { headers: { "Content-Type": "text/html" } },
    );
  }
  return new NextResponse(
    page({
      title: "Turn off email notifications?",
      body: "This stops case updates and hearing reminders from reaching your inbox. You can turn them back on anytime from Settings.",
      formToken: params.token,
    }),
    { headers: { "Content-Type": "text/html" } },
  );
}

export async function POST(_req: NextRequest, { params }: { params: { token: string } }) {
  const result = verifyUnsubscribeToken(params.token);
  if (!result.ok || result.channel !== "email") {
    return NextResponse.json({ ok: false, reason: result.ok ? "wrong_channel" : result.reason }, { status: 400 });
  }

  // Service-role (RLS-bypassing) write, scoped to EXACTLY the profile + tenant the signed token
  // names via adminFor(tenantId) (WO-364). Upsert-on-id: an existing row keeps its other columns
  // (WhatsApp/SMS/quiet-hours), a brand-new row gets the DB defaults — a user who never opened
  // Settings still unsubscribes.
  const { error } = await adminFor(result.tenantId)
    .from("notification_prefs")
    .upsert({
      id: result.profileId,
      channel_email: false,
      updated_at: new Date().toISOString(),
    });
  if (error) {
    console.error(`[unsubscribe] prefs upsert failed: ${error.message}`);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return new NextResponse(
    page({
      title: "You've been unsubscribed",
      body: "Email notifications are now off. You can turn them back on anytime from your Mukadma settings.",
    }),
    { headers: { "Content-Type": "text/html" } },
  );
}
