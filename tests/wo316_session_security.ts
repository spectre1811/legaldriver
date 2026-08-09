// WO-316 W1 — session & account security hardening. Offline, no secrets, no network.
// Run: npx tsx tests/wo316_session_security.ts
//
// The point of this file is that it exercises BEHAVIOUR. The auth suite that came
// before it largely asserted on committed source (`page.includes("isAllowedAdmin")`),
// which stays green if the gate is refactored into a no-op. Everything below either
// runs the real function or drives the real code path with a stubbed transport:
//
//   (A) the /api session guard — fail-closed on throw, 401 body, opt-in global scope
//   (B) revocation — a password change calls signOut with scope "global", once
//   (C) anti-enumeration — one indistinguishable failure code, and the codes that
//       used to split it are gone from the union, the catalogs and the UI
//   (D) security headers — the real objects next.config.mjs serves
//   (E) /request-access — length caps, and a flood drill over a stubbed fetch that
//       counts actual INSERTs and actual sends
//   (F) route inventory — every src/app/api/**/route.ts has a gate, or an explicit
//       allowlist entry WITH a reason. A new ungated route fails this test.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  currentUser,
  unauthorizedResponse,
  signOutScope,
  revokeAllSessions,
  PASSWORD_CHANGED_DESTINATION,
} from "../src/lib/auth/guard";
import { mapAuthError, isAuthErrorCode, AUTH_ERROR_CODES } from "../src/lib/auth/errors";
import { capText, NAME_MAX, NOTE_MAX } from "../src/lib/access/validate";
import { securityHeaders, contentSecurityPolicy, supabaseOrigin } from "../src/lib/security/headers.mjs";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed++;
}
const repo = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const src = (p: string) => readFileSync(repo(p), "utf8");

/** PostgREST accepts one row as an object and many as an array — normalise both. */
function insertedRows(body: string): Record<string, unknown>[] {
  if (!body) return [];
  const parsed: unknown = JSON.parse(body);
  return (Array.isArray(parsed) ? parsed : [parsed]) as Record<string, unknown>[];
}

async function main() {
  // ══ (A) the /api session guard ════════════════════════════════════════════
  {
    const signedIn = { auth: { async getUser() { return { data: { user: { id: "u1" } } }; } } };
    const anon = { auth: { async getUser() { return { data: { user: null } }; } } };
    const broken = { auth: { async getUser(): Promise<never> { throw new Error("gotrue unreachable"); } } };
    const garbage = { auth: { async getUser() { return { data: null }; } } };

    ok("guard: a signed-in user resolves", (await currentUser(signedIn))?.id === "u1");
    ok("guard: anonymous resolves to null", (await currentUser(anon)) === null);
    // Fail-CLOSED is the whole point: an auth outage must lock the door, not open it.
    ok("guard: a throwing getUser is NOT authenticated", (await currentUser(broken)) === null);
    ok("guard: an unexpected payload is NOT authenticated", (await currentUser(garbage)) === null);

    const res = unauthorizedResponse();
    ok("guard: unauthorized() is 401", res.status === 401);
    const body = (await res.json()) as Record<string, unknown>;
    // Contentless on purpose — a 401 must not say whether the account, the session
    // or the resource was the problem (same rule as the login error).
    ok("guard: 401 body leaks nothing but 'unauthorized'", Object.keys(body).join() === "error" && body.error === "unauthorized");
  }

  // ══ (B) revocation ════════════════════════════════════════════════════════
  {
    const calls: { scope: string }[] = [];
    const spy = { auth: { async signOut(o: { scope: "global" | "local" }) { calls.push(o); return { error: null }; } } };
    const applied = await revokeAllSessions(spy);
    ok("revoke: signOut called exactly once", calls.length === 1);
    ok("revoke: with scope 'global' (every device, this one included)", calls[0]?.scope === "global" && applied === "global");

    // "Sign out everywhere" is opt-in: an ordinary sign-out must never nuke the
    // user's other devices by accident.
    ok("scope: absent → local", signOutScope(undefined) === "local" && signOutScope(null) === "local");
    ok("scope: empty/whitespace → local", signOutScope("") === "local" && signOutScope("   ") === "local");
    ok("scope: junk → local", signOutScope("yes") === "local" && signOutScope("true") === "local" && signOutScope("1") === "local");
    ok("scope: a File (multipart) → local, never a crash", signOutScope({ name: "x" }) === "local");
    ok("scope: explicit global → global", signOutScope("global") === "global" && signOutScope(" GLOBAL ") === "global");
    ok("scope: 'all' → global", signOutScope("all") === "global");

    // The password-change path uses the SAME revoker, and lands somewhere that
    // explains the sign-out instead of bouncing silently off the middleware.
    const actions = src("src/app/login/actions.ts");
    ok("password change: revokes every session via revokeAllSessions", /updateUser\(\{ password \}\)[\s\S]*?revokeAllSessions\(supabase\)/.test(actions));
    ok("password change: lands on the explained login notice", actions.includes("PASSWORD_CHANGED_DESTINATION") && PASSWORD_CHANGED_DESTINATION === "/login?notice=passwordChanged");
    const panel = src("src/app/login/auth-panel.tsx");
    const page = src("src/app/login/page.tsx");
    ok("password change: /login renders the notice (not a silent bounce)", page.includes("passwordChanged") && panel.includes("notice.passwordChanged"));

    // The opt-in control exists on the surface a user can actually reach.
    const topBar = src("src/app/dashboard/top-bar.tsx");
    ok("revoke: the account menu offers 'sign out everywhere'", /name="scope" value="global"/.test(topBar) && topBar.includes("signOutEverywhere"));
    const signout = src("src/app/auth/signout/route.ts");
    ok("revoke: /auth/signout derives its scope from signOutScope", signout.includes("signOutScope(") && signout.includes("signOut({ scope })"));
  }

  // ══ (C) anti-enumeration ══════════════════════════════════════════════════
  {
    // GoTrue answers the SAME error for a wrong password and an unknown email.
    // Every shape it can send must map to one code — that is the whole defence.
    const shapes = [
      { code: "invalid_credentials", message: "Invalid login credentials" },
      { message: "Invalid login credentials" },
      { code: "invalid_credentials", message: "Invalid login credentials", status: 400 },
    ];
    const mapped = shapes.map((s) => mapAuthError(s, "signin"));
    ok("enumeration: every invalid-credentials shape maps to ONE code", new Set(mapped).size === 1 && mapped[0] === "invalidCredentials");

    // The two codes that used to split it are DELETED, not merely unused.
    ok("enumeration: 'wrongPassword' is not a code any more", !(AUTH_ERROR_CODES as readonly string[]).includes("wrongPassword") && !isAuthErrorCode("wrongPassword"));
    ok("enumeration: 'noAccount' is not a code any more", !(AUTH_ERROR_CODES as readonly string[]).includes("noAccount") && !isAuthErrorCode("noAccount"));

    // ...including their copy, so nobody can revive them by URL (?error=noAccount
    // renders the generic "unknown" instead of a leaky sentence).
    const en = JSON.parse(src("src/i18n/messages/en.json")) as { auth: { errors: Record<string, string>; notice: Record<string, string> } };
    const hi = JSON.parse(src("src/i18n/messages/hi.json")) as { auth: { errors: Record<string, string>; notice: Record<string, string> } };
    ok("enumeration: no EN/HI copy left for the split codes",
      !en.auth.errors.wrongPassword && !en.auth.errors.noAccount && !hi.auth.errors.wrongPassword && !hi.auth.errors.noAccount);
    ok("enumeration: the surviving code still has EN+HI copy", Boolean(en.auth.errors.invalidCredentials && hi.auth.errors.invalidCredentials));
    ok("notice: passwordChanged has EN+HI copy", Boolean(en.auth.notice.passwordChanged && hi.auth.notice.passwordChanged));

    // The oracle itself: an unauthenticated action must not query the service-role
    // admin users endpoint, and must not branch on whether the account exists.
    const actions = src("src/app/login/actions.ts");
    ok("enumeration: no admin users lookup on the sign-in path", !actions.includes("auth/v1/admin/users") && !actions.includes("emailHasAccount"));
    ok("enumeration: sign-in does not read the service-role key", !actions.includes("SUPABASE_SERVICE_ROLE_KEY"));
    const panel = src("src/app/login/auth-panel.tsx");
    ok("enumeration: the login UI has no account-exists branch", !panel.includes("noAccount") && !panel.includes("wrongPassword"));
  }

  // ══ (D) security headers ══════════════════════════════════════════════════
  {
    const hs = securityHeaders({ NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co" });
    const get = (k: string) => hs.find((h) => h.key.toLowerCase() === k.toLowerCase())?.value;

    const hsts = get("Strict-Transport-Security") ?? "";
    const maxAge = Number(/max-age=(\d+)/.exec(hsts)?.[1] ?? 0);
    ok("headers: HSTS present, ≥1 year, includeSubDomains", maxAge >= 31536000 && hsts.includes("includeSubDomains"));
    // `preload` is a hard-to-reverse apex-wide commitment — a founder call, not a side effect.
    ok("headers: HSTS does NOT self-submit to the preload list", !hsts.includes("preload"));
    ok("headers: X-Frame-Options DENY", get("X-Frame-Options") === "DENY");
    ok("headers: X-Content-Type-Options nosniff", get("X-Content-Type-Options") === "nosniff");
    ok("headers: Referrer-Policy set and not leaky", get("Referrer-Policy") === "strict-origin-when-cross-origin");

    // CSP ships REPORT-ONLY in this wave. Enforcing it is a separate, deliberate flip.
    ok("headers: CSP is report-only", Boolean(get("Content-Security-Policy-Report-Only")));
    ok("headers: CSP is NOT enforced yet", hs.every((h) => h.key !== "Content-Security-Policy"));
    const csp = get("Content-Security-Policy-Report-Only") ?? "";
    ok("csp: default-src is self", csp.includes("default-src 'self'"));
    ok("csp: object-src none + base-uri self", csp.includes("object-src 'none'") && csp.includes("base-uri 'self'"));
    ok("csp: form posts cannot be redirected off-site", csp.includes("form-action 'self'"));
    ok("csp: names the deployment's own Supabase origin", csp.includes("https://proj.supabase.co") && csp.includes("wss://proj.supabase.co"));
    // frame-ancestors is IGNORED in a report-only policy (and warns on every page
    // load); X-Frame-Options carries framing protection until CSP is enforced.
    ok("csp: no frame-ancestors while report-only", !csp.includes("frame-ancestors"));
    ok("csp: survives a missing/garbage Supabase URL", contentSecurityPolicy(undefined).includes("default-src 'self'") && contentSecurityPolicy("not a url").includes("default-src 'self'"));
    ok("csp: supabaseOrigin rejects junk", supabaseOrigin("nonsense") === null && supabaseOrigin(undefined) === null);
    // WO-323: Turnstile step-up must be allowed in script/frame/connect-src, and report-only needs a sink.
    ok(
      "csp: allows Cloudflare Turnstile (script/frame/connect-src)",
      /script-src[^;]*https:\/\/challenges\.cloudflare\.com/.test(csp) &&
        /frame-src[^;]*https:\/\/challenges\.cloudflare\.com/.test(csp) &&
        /connect-src[^;]*https:\/\/challenges\.cloudflare\.com/.test(csp),
    );
    ok("csp: report-uri sink so report-only actually observes", csp.includes("report-uri /api/csp-report"));

    // next.config.mjs must actually serve them, on every path.
    const cfg = src("next.config.mjs");
    ok("headers: next.config serves securityHeaders() on /:path*", /async headers\(\)[\s\S]*?source: "\/:path\*"[\s\S]*?securityHeaders\(\)/.test(cfg));
  }

  // ══ (E) /request-access — caps + the flood drill ══════════════════════════
  {
    ok("caps: a normal name passes through", capText("  Adv. Meera Shah ", NAME_MAX) === "Adv. Meera Shah");
    ok("caps: blank collapses to null (stores NULL, not '')", capText("   ", NAME_MAX) === null && capText(undefined, NOTE_MAX) === null);
    ok("caps: an oversized name is truncated to NAME_MAX", capText("x".repeat(5000), NAME_MAX)?.length === NAME_MAX);
    ok("caps: an oversized note is truncated to NOTE_MAX", capText("y".repeat(500_000), NOTE_MAX)?.length === NOTE_MAX);
    ok("caps: the bounds are sane", NAME_MAX > 0 && NAME_MAX <= 200 && NOTE_MAX > 0 && NOTE_MAX <= 5000);
    const form = src("src/app/request-access/request-form.tsx");
    ok("caps: the form's maxLength mirrors the server cap", form.includes("maxLength={NAME_MAX}") && form.includes("maxLength={NOTE_MAX}"));

    // ── flood drill: 5 rapid posts for one address over a stubbed transport ──
    // Drives the REAL server action. We count what actually left the process:
    // INSERTs into access_requests, and sends to the mail provider.
    const realFetch = globalThis.fetch;
    const env = { ...process.env };
    try {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
      process.env.RESEND_API_KEY = "re_test";
      process.env.FROM_EMAIL = "notify@mukadma.in";
      delete process.env.DEMO_MODE;

      // A tiny stand-in for access_requests: rows keyed by email, so the per-email
      // window is exercised rather than a global one.
      const rows = new Map<string, Record<string, unknown>[]>();
      let inserts = 0;
      let sends = 0;
      let lastInsertBody = "";
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(typeof input === "object" && "url" in input ? input.url : input);
        const method = (init?.method ?? "GET").toUpperCase();
        if (url.includes("api.resend.com")) {
          sends++;
          return new Response(JSON.stringify({ id: "email-1" }), { status: 200, headers: { "content-type": "application/json" } });
        }
        if (url.includes("/rest/v1/access_requests")) {
          if (method === "POST") {
            inserts++;
            lastInsertBody = String(init?.body ?? "");
            for (const r of insertedRows(lastInsertBody)) {
              rows.set(String(r.email), [...(rows.get(String(r.email)) ?? []), r]);
            }
            return new Response("", { status: 201, headers: { "content-type": "application/json" } });
          }
          // HEAD + `Prefer: count=exact` — PostgREST answers with Content-Range */N.
          // Honour the ?email=eq.<addr> filter so the count is per-address.
          const target = decodeURIComponent(/[?&]email=eq\.([^&]*)/.exec(url)?.[1] ?? "");
          return new Response(null, {
            status: 200,
            headers: { "content-range": `*/${(rows.get(target) ?? []).length}`, "content-type": "application/json" },
          });
        }
        if (url.includes("/rest/v1/outbound_email")) {
          return new Response("", { status: 201, headers: { "content-type": "application/json" } });
        }
        return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch;

      const { requestAccess } = await import("../src/app/request-access/actions");
      const post = (over: Record<string, string> = {}) => {
        const fd = new FormData();
        fd.set("email", "flood@firm.in");
        fd.set("name", "Flooder");
        fd.set("note", "hello");
        for (const [k, v] of Object.entries(over)) fd.set(k, v);
        return requestAccess({}, fd);
      };

      const first = await post();
      ok("flood: the first request is accepted", first.ok === true && first.email === "flood@firm.in");
      ok("flood: the count probe ran BEFORE the insert (0 rows → 1 insert)", inserts === 1);

      const repeats = [];
      for (let i = 0; i < 4; i++) repeats.push(await post());
      // Acceptance: ≤1 row per email per window and ≤1 email.
      ok("flood: 5 rapid posts → exactly 1 row", inserts === 1);
      ok("flood: 5 rapid posts → exactly 1 founder email", sends === 1);
      // ...and the answer is identical, so the form is not an oracle for
      // "has this address already asked?".
      ok("flood: a suppressed repeat is indistinguishable from the first", repeats.every((r) => r.ok === true && r.email === "flood@firm.in" && !r.error));

      // A different address in the same window is unaffected — this is a per-email
      // window, not a global gate that would drop everyone behind one flooder.
      const other = await post({ email: "genuine@firm.in" });
      ok("flood: a different address still gets through", other.ok === true && inserts === 2 && sends === 2);

      // Oversized free text never reaches the transport at full length.
      await post({ email: "huge@firm.in", name: "n".repeat(4000), note: "o".repeat(400_000) });
      const inserted = insertedRows(lastInsertBody)[0] ?? {};
      ok("caps: the stored name is capped at NAME_MAX", String(inserted.name ?? "").length === NAME_MAX);
      ok("caps: the stored note is capped at NOTE_MAX", String(inserted.note ?? "").length === NOTE_MAX);
    } finally {
      globalThis.fetch = realFetch;
      for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "FROM_EMAIL"]) {
        if (env[k] === undefined) delete process.env[k];
        else process.env[k] = env[k];
      }
    }
  }

  // ══ (F) route inventory — no ungated /api route may ship ══════════════════
  {
    const API_DIR = "src/app/api";
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((e) => {
        const p = join(dir, e);
        return statSync(p).isDirectory() ? walk(p) : p.endsWith("route.ts") ? [p] : [];
      });
    const abs = repo(API_DIR);
    const routes = walk(abs).map((p) => `${API_DIR}/${p.slice(abs.length + 1)}`).sort();

    type Gate = "session" | "cron" | "webhook" | "token" | "rls";
    // The gates this codebase actually uses. A route that matches none of them is
    // reachable by anyone on the internet.
    const gateOf = (s: string): Gate | null => {
      if (/currentUser\(|auth\.getUser\(/.test(s)) return "session";
      if (/CRON_SECRET/.test(s)) return "cron";
      if (/verifySignature\(|verifyWebhook|hub\.verify_token/.test(s)) return "webhook";
      if (/capture_token/.test(s)) return "token";
      // The RLS server client IS an auth boundary: it carries the caller's cookies,
      // so an anonymous request reads nothing. Admin (service-role) clients bypass
      // RLS and therefore never count as a gate.
      if (/@\/lib\/supabase\/server/.test(s) && !/createAdminClient/.test(s)) return "rls";
      return null;
    };

    // Deliberately ungated — each entry states WHY. Adding a route here is a
    // decision someone has to write down; forgetting one is a test failure.
    const ALLOWLIST: Record<string, string> = {
      [`${API_DIR}/health/route.ts`]:
        "public build-identity probe (WO-63): echoes a commit SHA and nothing secret, and an uptime monitor must reach it without a credential",
      [`${API_DIR}/voice/telephony/route.ts`]:
        "provider webhook, hard-gated by TELEPHONY_PROVIDER (unset) and a no-op without a DID→tenant mapping; signature verification lands when a provider is actually wired",
      [`${API_DIR}/csp-report/route.ts`]:
        "CSP violation sink (WO-323): browsers POST report-only violations here with no credential; it stores nothing and only logs a bounded, PII-free directive/URI summary, then 204s",
    };

    ok("inventory: routes were found (the walker is not silently empty)", routes.length > 10);

    const ungated = routes.filter((r) => !gateOf(src(r)) && !(r in ALLOWLIST));
    ok("inventory: every /api route has an auth gate or a written-down exemption", ungated.length === 0);
    if (ungated.length) {
      console.log(`   ungated: ${ungated.join(", ")}`);
      console.log("   → add a session/cron/webhook/token gate, or an ALLOWLIST entry in this test explaining why it is public.");
    }

    // Keep the allowlist honest in both directions.
    const missing = Object.keys(ALLOWLIST).filter((r) => !routes.includes(r));
    ok("inventory: no allowlist entry points at a route that no longer exists", missing.length === 0);
    if (missing.length) console.log(`   stale: ${missing.join(", ")}`);
    const nowGated = Object.keys(ALLOWLIST).filter((r) => routes.includes(r) && gateOf(src(r)));
    ok("inventory: no allowlist entry for a route that is now gated", nowGated.length === 0);
    if (nowGated.length) console.log(`   remove from ALLOWLIST: ${nowGated.join(", ")}`);
    ok("inventory: every exemption states a reason", Object.values(ALLOWLIST).every((why) => why.trim().length > 20));

    // The two holes this wave closed, named explicitly so a revert is loud.
    ok("inventory: /api/court/judge is session-gated", gateOf(src(`${API_DIR}/court/judge/route.ts`)) === "session");
    ok("inventory: /api/court/advocate is session-gated", gateOf(src(`${API_DIR}/court/advocate/route.ts`)) === "session");
    for (const r of [`${API_DIR}/court/judge/route.ts`, `${API_DIR}/court/advocate/route.ts`]) {
      const s = src(r);
      // The gate must precede the spend: no keyed upstream call before the 401.
      ok(`inventory: ${r} 401s before it calls the court API`,
        s.indexOf("unauthorizedResponse()") > 0 && s.indexOf("unauthorizedResponse()") < s.indexOf("await resolve"));
    }
  }
}

main().then(() => {
  console.log(failed ? `WO-316 SESSION SECURITY: FAIL (${failed})` : "WO-316 SESSION SECURITY: PASS");
  process.exit(failed ? 1 : 0);
});
