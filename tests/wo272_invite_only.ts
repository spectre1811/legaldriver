// WO-272 — invite-only auth. Offline, no secrets. Run: npx tsx tests/wo272_invite_only.ts
// Covers: the pure email validator; the source-contract that public signup is
// closed (email + Google), that forgot-password has no signup loophole, that the
// access_requests intake stores durably + notifies, and EN/HI copy parity.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isValidEmail, normalizeEmail } from "../src/lib/access/validate";
import { mapAuthError, isAuthErrorCode, AUTH_ERROR_CODES } from "../src/lib/auth/errors";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed++;
}
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// ── pure email validation ──
ok("email: plain valid", isValidEmail("adv@firm.in"));
ok("email: rejects missing @", !isValidEmail("advfirm.in"));
ok("email: rejects missing domain dot", !isValidEmail("adv@firm"));
ok("email: rejects spaces", !isValidEmail("a b@firm.in"));
ok("email: rejects over-long", !isValidEmail("a".repeat(250) + "@firm.in"));
ok("email: normalize lowercases + trims", normalizeEmail("  Adv@Firm.IN ") === "adv@firm.in");

// ── invite-only is a real error code + maps from GoTrue signup-disabled ──
ok("code: inviteOnly is a valid auth error code", isAuthErrorCode("inviteOnly"));
ok("map: signup_disabled → inviteOnly", mapAuthError({ code: "signup_disabled" }, "signup") === "inviteOnly");
ok("map: 'Signups not allowed' msg → inviteOnly (oauth)", mapAuthError({ message: "Signups not allowed for this instance" }, "oauth") === "inviteOnly");

// ── login actions: signup is blocked before ever hitting GoTrue ──
{
  const actions = src("src/app/login/actions.ts");
  ok(
    "actions: signUp refuses with inviteOnly (no GoTrue signUp call)",
    /export async function signUp[\s\S]*?return \{ error: "inviteOnly" \}/.test(actions) && !actions.includes("supabase.auth.signUp"),
  );
  // Forgot-password stays available for existing users (recovery path preserved).
  ok("actions: forgot-password (resetPasswordForEmail) is kept", actions.includes("resetPasswordForEmail"));
  ok("actions: Google sign-in retained (existing users)", actions.includes("signInWithOAuth"));
}

// ── forgot-password / passwordless has NO signup loophole across the whole app ──
// resetPasswordForEmail cannot create users; assert there is also no OTP/magic-link
// path with shouldCreateUser that could mint an account.
{
  const root = dirname(fileURLToPath(new URL("../src/x", import.meta.url))); // → <repo>/src
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((e) => {
      const p = join(dir, e);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") || p.endsWith(".tsx") ? [p] : [];
    });
  const files = walk(root);
  const otp = files.filter((f) => readFileSync(f, "utf8").includes("signInWithOtp"));
  const create = files.filter((f) => readFileSync(f, "utf8").includes("shouldCreateUser"));
  ok("loophole: no signInWithOtp anywhere in src", otp.length === 0);
  if (otp.length) console.log("   in:", otp.join(", "));
  ok("loophole: no shouldCreateUser anywhere in src", create.length === 0);
  if (create.length) console.log("   in:", create.join(", "));
}

// ── login UI: no signup form/toggle; Google + email/password kept; request-access surfaced ──
{
  const panel = src("src/app/login/auth-panel.tsx");
  ok("panel: no SignUpForm component", !panel.includes("SignUpForm"));
  ok("panel: does not import the signUp action", !/\bsignUp\b/.test(panel));
  ok("panel: keeps Google sign-in", panel.includes("signInWithGoogle") && panel.includes("GoogleButton"));
  ok("panel: routes new users to /request-access", panel.includes("/request-access"));
  ok("panel: has an inviteOnly notice branch", panel.includes('notice === "inviteOnly"'));

  const page = src("src/app/login/page.tsx");
  ok("page: ?mode=signup maps to the inviteOnly notice, not a signup form", page.includes("wantsSignup") && page.includes('"inviteOnly"'));
  ok("page: never passes a signup mode", !/mode = .*"signup"/.test(page));
}

// ── blocked new-Google lands on the invite-only notice, not the scary error page ──
{
  const cb = src("src/app/auth/callback/route.ts");
  ok("callback: signups-disabled → /login?error=inviteOnly", cb.includes("signupsDisabled") && cb.includes("error=inviteOnly"));
}

// ── request-access intake: honeypot, durable store via admin client, env recipient, dedupe ──
{
  const a = src("src/app/request-access/actions.ts");
  ok("intake: honeypot field checked", a.includes('field(formData, "company")'));
  ok("intake: stores via the service-role admin client", a.includes("createAdminClient") && a.includes('from("access_requests").insert'));
  ok("intake: recipient from ACCESS_REQUEST_NOTIFY env", a.includes("ACCESS_REQUEST_NOTIFY"));
  ok("intake: 10-min notification dedupe", a.includes("DEDUPE_MS") && a.includes("recentlyNotified"));
  ok("intake: a failed email never fails the request", a.includes(".catch(() => {})"));
}

// ── migration: access_requests is RLS-enabled and NON-tenant (deny-all, service-role only) ──
{
  const migDir = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));
  const mig = readdirSync(migDir).find((f) => f.includes("access_requests"));
  ok("migration: access_requests migration exists", Boolean(mig));
  if (mig) {
    const sql = readFileSync(join(migDir, mig), "utf8");
    ok("migration: creates the table", /create table if not exists access_requests/.test(sql));
    ok("migration: enables RLS", /enable row level security/.test(sql));
    ok("migration: NOT tenant-scoped (no current_tenant_id policy)", !sql.includes("current_tenant_id"));
    ok("migration: no anon/authenticated policy (deny-all except service-role)", !/create policy/i.test(sql));
  }
}

// ── i18n: EN + HI parity for the new keys ──
{
  const en = JSON.parse(src("src/i18n/messages/en.json"));
  const hi = JSON.parse(src("src/i18n/messages/hi.json"));
  ok("i18n: auth.errors.inviteOnly EN+HI", Boolean(en.auth?.errors?.inviteOnly && hi.auth?.errors?.inviteOnly));
  const inviteKeys = ["prompt", "cta", "noticeTitle", "noticeBody"];
  ok("i18n: auth.invite.* EN+HI", inviteKeys.every((k) => en.auth?.invite?.[k] && hi.auth?.invite?.[k]));
  const raKeys = ["title", "subtitle", "name", "email", "note", "cta", "pending", "sentTitle", "sentBody", "backToLogin"];
  ok("i18n: requestAccess.* EN+HI", raKeys.every((k) => en.requestAccess?.[k] && hi.requestAccess?.[k]));
  ok("i18n: requestAccess.errors EN+HI", Boolean(en.requestAccess?.errors?.email && hi.requestAccess?.errors?.email));
  ok("i18n: inviteOnly is in AUTH_ERROR_CODES", AUTH_ERROR_CODES.includes("inviteOnly"));
}

console.log(failed ? `WO-272 INVITE-ONLY: FAIL (${failed})` : "WO-272 INVITE-ONLY: PASS");
process.exit(failed ? 1 : 0);
