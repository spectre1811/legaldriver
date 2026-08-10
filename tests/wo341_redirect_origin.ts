// WO-341 — P0: Google sign-in redirected to https://localhost:3000/dashboard in
// prod (ERR_SSL_PROTOCOL_ERROR). Offline, no secrets. Run: npx tsx tests/wo341_redirect_origin.ts
//
// Root cause: auth/callback, api/google/callback and api/google/connect built their
// redirect target off `new URL(request.url).origin` / `request.url` — behind the
// WO-323 self-host edge (Next standalone behind Caddy + cloudflared, no Vercel
// host-injection) that resolves to the internal `http://localhost:3000`, not the
// public host. Fix: derive the redirect origin from requestOrigin(request.headers)
// (same helper + convention as tests/wo329_forwarded_host.ts).
//
// (A) real behavioral call: api/google/callback returns its redirect on the
// invalid-state path BEFORE calling createClient() (next/headers cookies() —
// unavailable outside a live Next request), so this drives the actual route
// handler end to end, not a source-string proxy for it.
// (B) auth/callback and api/google/connect can't be driven the same way — the
// former's success/import chain pulls in `import "server-only"` (no real
// resolution outside Next's bundler), the latter calls createClient() as its
// first statement unconditionally — asserted as source contracts instead, same
// convention as tests/wo50_auth_flows.ts / tests/wo329_forwarded_host.ts.
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed++;
}
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

async function main() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fake.supabase.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fake-anon-key";

  // ── (A) api/google/callback: invalid OAuth state → forwarded host must win ──
  {
    const { GET } = await import("../src/app/api/google/callback/route");
    const req = new NextRequest("http://internal-localhost:3000/api/google/callback", {
      headers: { "x-forwarded-host": "mukadma.in", "x-forwarded-proto": "https" },
    });
    const res = await GET(req);
    const location = res.headers.get("location");
    ok("google/callback invalid state: redirect fires", res.status === 307);
    ok(
      "google/callback invalid state: Location uses the forwarded public origin",
      location === "https://mukadma.in/dashboard/inbox?error=Invalid%20OAuth%20state",
    );
    ok("google/callback invalid state: never leaks the internal host", !!location && !location.includes("localhost"));
  }

  {
    const { GET } = await import("../src/app/api/google/callback/route");
    const req = new NextRequest("http://internal-localhost:3000/api/google/callback", {
      headers: { "x-forwarded-host": "app.mukadma.in" }, // no x-forwarded-proto → https for a non-localhost host
    });
    const res = await GET(req);
    ok(
      "google/callback: proto defaults to https for a real forwarded host",
      res.headers.get("location") === "https://app.mukadma.in/dashboard/inbox?error=Invalid%20OAuth%20state",
    );
  }

  // ── (B) source contracts for the sites a session-less test can't reach ──
  const cb = src("src/app/auth/callback/route.ts");
  ok("auth/callback: imports requestOrigin", cb.includes('import { requestOrigin, sanitizeNext } from "@/lib/auth/redirects"'));
  ok("auth/callback: origin comes from requestOrigin(request.headers)", cb.includes("const origin = requestOrigin(request.headers);"));
  ok(
    "auth/callback: the Google→dashboard redirect (`${origin}${next}`) uses the fixed origin",
    /const res = NextResponse\.redirect\(`\$\{origin\}\$\{next\}`\);/.test(cb),
  );
  ok(
    "auth/callback: no redirect origin still built off new URL(request.url).origin",
    !/const \{ searchParams, origin \} = new URL\(request\.url\)/.test(cb),
  );

  const gcb = src("src/app/api/google/callback/route.ts");
  ok("google/callback: imports requestOrigin", gcb.includes('import { requestOrigin } from "@/lib/auth/redirects"'));
  ok("google/callback: origin comes from requestOrigin(request.headers)", gcb.includes("const origin = requestOrigin(request.headers);"));
  ok(
    "google/callback: no redirect origin still built off new URL(request.url).origin",
    !/const \{ searchParams, origin \} = new URL\(request\.url\)/.test(gcb),
  );

  const gconnect = src("src/app/api/google/connect/route.ts");
  ok("google/connect: imports requestOrigin", gconnect.includes('import { requestOrigin } from "@/lib/auth/redirects"'));
  ok(
    "google/connect: redirect base is requestOrigin(request.headers), not new URL(..., request.url)",
    gconnect.includes("const origin = requestOrigin(request.headers);") && !/new URL\([^)]*, request\.url\)/.test(gconnect),
  );

  console.log(failed ? `WO-341 REDIRECT ORIGIN: FAIL (${failed})` : "WO-341 REDIRECT ORIGIN: PASS");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("THROWN", e);
  process.exit(1);
});
