"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { mapAuthError, type AuthErrorCode } from "@/lib/auth/errors";
import { callbackUrl, loginUrl, postAuthPath, requestOrigin } from "@/lib/auth/redirects";

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

// GoTrue deliberately answers "Invalid login credentials" for BOTH a wrong
// password and a missing account. The WO wants distinct, human copy — ask the
// admin users endpoint (service role, server-only, exact-match check). Fails
// soft: null = cannot tell (no key / network) → generic combined copy.
async function emailHasAccount(email: string): Promise<boolean | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(
      `${url}/auth/v1/admin/users?per_page=50&filter=${encodeURIComponent(email)}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { users?: { email?: string }[] };
    const target = email.toLowerCase();
    return Boolean(body.users?.some((u) => u.email?.toLowerCase() === target));
  } catch {
    return null;
  }
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = field(formData, "email");
  const password = String(formData.get("password") ?? "");
  const next = field(formData, "next") || null;
  const track = field(formData, "track") || null;

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const code = mapAuthError(error, "signin");
    if (code === "unconfirmed") return { error: "unconfirmed", email };
    if (code === "invalidCredentials") {
      const exists = await emailHasAccount(email);
      if (exists === true) return { error: "wrongPassword" };
      if (exists === false) return { error: "noAccount" };
    }
    return { error: code };
  }
  revalidatePath("/", "layout");
  redirect(postAuthPath(next, track));
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = field(formData, "email");
  const password = String(formData.get("password") ?? "");
  const next = field(formData, "next") || null;
  const track = field(formData, "track") || null;

  const supabase = createClient();
  // Full name is NOT collected here — it belongs to onboarding (WO-50 ruling).
  // The handle_new_user trigger tolerates a missing full_name.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: callbackUrl(base(), next, track) },
  });
  if (error) return { error: mapAuthError(error, "signup") };
  // With confirmations ON, GoTrue obfuscates "already registered" as a success
  // whose user has no identities — surface it honestly as "account exists".
  if (data.user && (data.user.identities?.length ?? 0) === 0) return { error: "accountExists" };
  if (data.session) {
    // Email confirmations disabled (e.g. local dev) — user is signed in already.
    revalidatePath("/", "layout");
    redirect(postAuthPath(next, track));
  }
  return { ok: "confirm", email };
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
  revalidatePath("/", "layout");
  redirect("/dashboard");
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
