// WO-50 — map Supabase auth failures to stable i18n error codes (auth.errors.*).
// Distinct, human copy per failure class: wrong password ≠ no account ≠
// unconfirmed email ≠ OAuth failure. Pure + unit-tested (tests/wo50_auth_flows.ts);
// the raw provider message never reaches the UI (English-only + leaky).

export const AUTH_ERROR_CODES = [
  "wrongPassword", // password sign-in: account exists, password wrong
  "noAccount", // password sign-in: no account for this email
  "invalidCredentials", // password sign-in: could not tell which of the two
  "unconfirmed", // email exists but was never confirmed
  "accountExists", // sign-up with an email that already has an account
  "weakPassword", // sign-up/reset: password too short/weak
  "samePassword", // reset: new password equals the old one
  "rateLimited", // too many attempts / emails — try later
  "googleUnavailable", // Google provider not enabled in Supabase (FOUNDER-ACTIONS #6)
  "googleFailed", // OAuth started but failed for another reason
  "sessionExpired", // reset link consumed/expired — no session for updateUser
  "resetFailed", // resetPasswordForEmail errored
  "resendFailed", // confirmation resend errored
  "callbackFailed", // /auth/callback could not exchange the code
  "unknown",
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export function isAuthErrorCode(v: string | null | undefined): v is AuthErrorCode {
  return Boolean(v) && (AUTH_ERROR_CODES as readonly string[]).includes(v as string);
}

type AuthErrorLike = { code?: string; message?: string; status?: number } | null | undefined;
export type AuthContext = "signin" | "signup" | "oauth" | "reset" | "resend" | "update";

/** Map a Supabase auth error to a stable code. Never returns the raw message. */
export function mapAuthError(error: AuthErrorLike, ctx: AuthContext): AuthErrorCode {
  const code = error?.code ?? "";
  const msg = (error?.message ?? "").toLowerCase();
  const status = error?.status ?? 0;

  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || status === 429 || msg.includes("rate limit"))
    return "rateLimited";
  if (code === "email_not_confirmed" || msg.includes("email not confirmed")) return "unconfirmed";
  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) return "invalidCredentials";
  if (code === "user_already_exists" || code === "email_exists" || msg.includes("already registered"))
    return "accountExists";
  if (code === "weak_password" || msg.includes("password should be")) return "weakPassword";
  if (code === "same_password" || msg.includes("different from the old")) return "samePassword";
  if (code === "session_expired" || code === "session_not_found" || msg.includes("auth session missing"))
    return "sessionExpired";

  if (ctx === "oauth") {
    // GoTrue answers "validation_failed / Unsupported provider: provider is not
    // enabled" while FOUNDER-ACTIONS #6 is pending — say so in plain language.
    if (code === "validation_failed" || msg.includes("not enabled") || msg.includes("unsupported provider"))
      return "googleUnavailable";
    return "googleFailed";
  }
  if (ctx === "reset") return "resetFailed";
  if (ctx === "resend") return "resendFailed";
  if (ctx === "update") return "sessionExpired";
  return "unknown";
}
