"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { mapAuthError, type AuthErrorCode } from "@/lib/auth/errors";
import { revokeAllSessions, PASSWORD_CHANGED_DESTINATION } from "@/lib/auth/guard";
import { callbackUrl, loginUrl, postAuthPath, requestOrigin } from "@/lib/auth/redirects";
// `track` (the analytics seam) is imported as `trackEvent` — a local `track` form field (a CNR
// deep-link, WO-50) shadows the name in these actions. WO-184 user-lifecycle instrumentation.
import { track as trackEvent } from "@/lib/analytics/track";

// WO-50 login/signup redesign — every action returns a stable error CODE (the
// client renders translated copy, EN+HI) and redirects on success. Emails stay
// out of URLs and logs (no-PII rule); confirm-screen state travels via form state.

export type AuthFormState = {
  error?: AuthErrorCode;
  /** Successful non-redirect outcomes the client renders as a screen/notice. */
  ok?: "confirm" | "resent" | "resetSent";
  /** Echo of the submitted email for the confirm / reset-sent screens. */
  email?: string;
};

// Redirect base = the origin this request came in on (preview, prod, or dev)
// — never a baked env var, so OAuth/email round-trips return where they began.
const base = () => requestOrigin(headers());
const field = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

// WO-316 — the user-enumeration oracle is GONE. GoTrue deliberately answers the
// same "Invalid login credentials" for a wrong password and for an unknown email;
// WO-50 un-blurred that by asking the service-role admin users endpoint, which
// handed anyone an unauthenticated, unthrottled "is this person a customer?" probe
// — and Mukadma is invite-only, so the customer list IS the secret. One code,
// `invalidCredentials`, now covers both, and nothing on this path can tell them
// apart. Do not reintroduce a distinguishing lookup here.

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = field(formData, "email");
  const password = String(formData.get("password") ?? "");
  const next = field(formData, "next") || null;
  const track = field(formData, "track") || null;

  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const code = mapAuthError(error, "signin");
    if (code === "unconfirmed") return { error: "unconfirmed", email };
    return { error: code };
  }
  if (data.user) trackEvent("login", data.user.id, { method: "password" });
  revalidatePath("/", "layout");
  redirect(postAuthPath(next, track));
}

// WO-272 — Mukadma is invite-only. Public account creation is closed: this
// action NO LONGER creates accounts. It refuses before ever touching GoTrue, so
// the lock holds even if the Supabase `disable_signup` flag is toggled off (the
// flag is the serving-side boundary; this is defense-in-depth). The login UI no
// longer surfaces a signup form; interested people are routed to /request-access.
export async function signUp(_prev: AuthFormState, _formData: FormData): Promise<AuthFormState> {
  return { error: "inviteOnly" };
}

export async function resendConfirmation(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = field(formData, "email");
  const next = field(formData, "next") || null;
  const track = field(formData, "track") || null;

  const supabase = createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: callbackUrl(base(), next, track) },
  });
  if (error) return { error: mapAuthError(error, "resend"), email };
  return { ok: "resent", email };
}

export async function requestPasswordReset(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = field(formData, "email");
  const supabase = createClient();
  // Lands on /auth/callback which exchanges the recovery code, then /reset-password.
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${base()}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
  });
  // Neutral success copy either way — the reset flow must not enumerate accounts.
  if (error && mapAuthError(error, "reset") === "rateLimited") return { error: "rateLimited", email };
  if (error) return { error: "resetFailed", email };
  return { ok: "resetSent", email };
}

export async function updatePassword(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const password = String(formData.get("password") ?? "");
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "sessionExpired" };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: mapAuthError(error, "update") };
  // WO-316 — a password change REVOKES every session, this one included. Before
  // this, changing a password evicted nobody: a stolen cookie survived the very
  // action taken to kill it. See revokeAllSessions for why the scope is global.
  await revokeAllSessions(supabase);
  revalidatePath("/", "layout");
  redirect(PASSWORD_CHANGED_DESTINATION);
}

// "Continue with Google". Plain form action: success leaves the site for
// Google, so errors travel back to /login as a code in the URL (?error=…).
export async function signInWithGoogle(formData: FormData) {
  const mode = field(formData, "mode") || "signin";
  const next = field(formData, "next") || null;
  const track = field(formData, "track") || null;

  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl(base(), next, track) },
  });
  if (error) redirect(loginUrl({ mode, next, track, error: mapAuthError(error, "oauth") }));
  if (data.url) redirect(data.url);
  redirect(loginUrl({ mode, next, track, error: "googleFailed" }));
}
