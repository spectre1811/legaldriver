// WO-50 — login & signup redesign. Offline, no secrets. Run: npx tsx tests/wo50_auth_flows.ts
// Covers the pure auth plumbing (redirect sanitising + error-code mapping) directly, and
// locks the flow contract by asserting on committed source: no full-name field at signup,
// OAuth/email round-trips carry an explicit redirect, the callback never silently bounces,
// and the middleware preserves the deep-link intent.
import { readFileSync } from "node:fs";
import { sanitizeNext, sanitizeTrack, postAuthPath, callbackUrl, loginUrl, requestOrigin } from "../src/lib/auth/redirects";
import { mapAuthError, isAuthErrorCode, AUTH_ERROR_CODES } from "../src/lib/auth/errors";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed++;
}
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// ── requestOrigin: OAuth/email redirects use the origin the request arrived on ──
// (Root cause of "Google fails sometimes": APP_BASE_URL ?? localhost bounced
// preview/unset-env deployments to the wrong domain, killing PKCE exchange.)
{
  const H = (o: Record<string, string>) => new Headers(o);
  ok(
    "origin: vercel forwarded host+proto win",
    requestOrigin(H({ "x-forwarded-host": "app-git-wo50.vercel.app", "x-forwarded-proto": "https", host: "127.0.0.1:3000" })) ===
      "https://app-git-wo50.vercel.app",
  );
  ok(
    "origin: comma lists take the first hop",
    requestOrigin(H({ "x-forwarded-host": "legaldriver.vercel.app, internal", "x-forwarded-proto": "https,http" })) ===
      "https://legaldriver.vercel.app",
  );
  ok("origin: plain host, localhost → http", requestOrigin(H({ host: "localhost:3000" })) === "http://localhost:3000");
  ok("origin: plain host, real domain → https", requestOrigin(H({ host: "legaldriver.vercel.app" })) === "https://legaldriver.vercel.app");
  {
    const prev = process.env.APP_BASE_URL;
    process.env.APP_BASE_URL = "https://env.example";
    ok("origin: no host headers → APP_BASE_URL", requestOrigin(H({})) === "https://env.example");
    delete process.env.APP_BASE_URL;
    ok("origin: last resort is localhost", requestOrigin(H({})) === "http://localhost:3000");
    if (prev !== undefined) process.env.APP_BASE_URL = prev;
  }
}

// ── sanitizeNext: same-origin paths only ──
ok("next: plain path allowed", sanitizeNext("/dashboard/cases?x=1") === "/dashboard/cases?x=1");
ok("next: protocol-relative rejected", sanitizeNext("//evil.example") === null);
ok("next: backslash trick rejected", sanitizeNext("/\\evil.example") === null);
ok("next: absolute URL rejected", sanitizeNext("https://evil.example/x") === null);
ok("next: embedded scheme rejected", sanitizeNext("/x?u=https://e") === null); // scheme inside query is rejected too (conservative)
ok("next: empty → null", sanitizeNext("") === null && sanitizeNext(null) === null);

// ── sanitizeTrack: CNR-ish tokens only ──
ok("track: 16-char CNR accepted + uppercased", sanitizeTrack("gjhc010012342024") === "GJHC010012342024");
ok("track: path injection rejected", sanitizeTrack("/evil") === null);
ok("track: too short rejected", sanitizeTrack("ab1") === null);

// ── postAuthPath: track wins → next → dashboard ──
ok("dest: track wins over next", postAuthPath("/x", "GJHC010012342024") === "/dashboard/cases?track=GJHC010012342024");
ok("dest: next when no track", postAuthPath("/dashboard/calendar", null) === "/dashboard/calendar");
ok("dest: default dashboard", postAuthPath(null, null) === "/dashboard");
ok("dest: hostile next falls back", postAuthPath("//evil", null) === "/dashboard");

// ── callbackUrl: explicit redirectTo for the OAuth/email round-trip ──
ok("callback: bare when default dest", callbackUrl("https://app.example") === "https://app.example/auth/callback");
ok(
  "callback: carries encoded next",
  callbackUrl("https://app.example/", null, "GJHC010012342024") ===
    `https://app.example/auth/callback?next=${encodeURIComponent("/dashboard/cases?track=GJHC010012342024")}`,
);

// ── loginUrl: modes + intent, no emails in URLs ──
ok("loginUrl: default is bare", loginUrl() === "/login");
ok("loginUrl: signin mode omitted", loginUrl({ mode: "signin" }) === "/login");
ok("loginUrl: keeps mode+error+track", loginUrl({ mode: "signup", error: "googleUnavailable", track: "GJHC010012342024" }).includes("mode=signup"));
ok("loginUrl: drops hostile next", !loginUrl({ next: "//evil" }).includes("next"));

// ── mapAuthError: distinct, stable codes ──
ok("err: invalid creds", mapAuthError({ code: "invalid_credentials", message: "Invalid login credentials" }, "signin") === "invalidCredentials");
ok("err: unconfirmed", mapAuthError({ code: "email_not_confirmed" }, "signin") === "unconfirmed");
ok("err: unconfirmed by message", mapAuthError({ message: "Email not confirmed" }, "signin") === "unconfirmed");
ok("err: account exists", mapAuthError({ code: "user_already_exists" }, "signup") === "accountExists");
ok("err: weak password", mapAuthError({ message: "Password should be at least 6 characters" }, "signup") === "weakPassword");
ok("err: rate limit via status", mapAuthError({ status: 429 }, "resend") === "rateLimited");
ok("err: provider not enabled → human code", mapAuthError({ code: "validation_failed", message: "Unsupported provider: provider is not enabled" }, "oauth") === "googleUnavailable");
ok("err: other oauth failure", mapAuthError({ message: "boom" }, "oauth") === "googleFailed");
ok("err: update without session", mapAuthError({ message: "Auth session missing!" }, "update") === "sessionExpired");
ok("err: unknown fallback", mapAuthError({ message: "???" }, "signin") === "unknown");
ok("err: isAuthErrorCode guards URL input", isAuthErrorCode("googleUnavailable") && !isAuthErrorCode("Could not sign in"));

// ── i18n: every error code has EN + HI copy (full-parity rule, WO-10) ──
{
  const en = JSON.parse(src("src/i18n/messages/en.json"));
  const hi = JSON.parse(src("src/i18n/messages/hi.json"));
  const missing = AUTH_ERROR_CODES.filter((c) => !en.auth?.errors?.[c] || !hi.auth?.errors?.[c]);
  ok(`i18n: all ${AUTH_ERROR_CODES.length} error codes have EN+HI copy`, missing.length === 0);
  if (missing.length) console.log("   missing:", missing.join(", "));
}

// ── source contracts ──
{
  const page = src("src/app/login/page.tsx");
  const panel = src("src/app/login/auth-panel.tsx");
  ok("login: no full-name field at signup (moved to onboarding)", !page.includes("full_name") && !panel.includes("full_name"));
  ok("login: renders the two-mode client panel", page.includes("AuthPanel"));

  const actions = src("src/app/login/actions.ts");
  ok("actions: OAuth uses explicit redirectTo via callbackUrl", /signInWithOAuth[\s\S]*?redirectTo: callbackUrl/.test(actions));
  // WO-272 — signup is invite-only blocked: the action refuses before touching
  // GoTrue, so actions.ts no longer calls supabase.auth.signUp at all.
  ok(
    "actions: signup is invite-only blocked (no GoTrue signUp call)",
    /export async function signUp[\s\S]*?return \{ error: "inviteOnly" \}/.test(actions) && !actions.includes("supabase.auth.signUp"),
  );
  ok("actions: reset flow lands on /reset-password", actions.includes("resetPasswordForEmail") && actions.includes("/reset-password"));
  ok("actions: no raw provider message reaches the UI", !actions.includes("error.message"));
  ok(
    "actions: redirect base is the request origin, never a baked env var",
    actions.includes("requestOrigin(headers())") && !actions.includes("APP_BASE_URL"),
  );

  const cb = src("src/app/auth/callback/route.ts");
  ok("callback: failures go to the visible error page", cb.includes("/auth/error"));
  ok("callback: no silent bounce to /login on failure", !cb.includes("Could not sign in"));
  ok("callback: sanitises ?next=", cb.includes("sanitizeNext"));

  const mw = src("src/lib/supabase/middleware.ts");
  ok("middleware: unauthenticated redirect remembers ?next=", mw.includes('searchParams.set("next"'));
  ok("middleware: signed-in /login honours deep-link intent", mw.includes("postAuthPath"));
  ok("middleware: notice is an i18n code, not prose", mw.includes('"confirmEmail"') && !mw.includes("Please confirm your email —"));

  const reset = src("src/app/reset-password/page.tsx");
  ok("reset page: dead link is an explicit state with a way back", reset.includes("expiredTitle") && reset.includes("mode=forgot"));

  const addForm = src("src/app/dashboard/cases/add-case-form.tsx");
  ok("track: add-case form auto-submits the deep-linked CNR once", addForm.includes("autoCnr") && addForm.includes("requestSubmit"));
}

console.log(failed ? `WO-50 AUTH FLOWS: FAIL (${failed})` : "WO-50 AUTH FLOWS: PASS");
process.exit(failed ? 1 : 0);
