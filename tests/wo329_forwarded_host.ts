// WO-329 — middleware login-redirect must honor X-Forwarded-Host/-Proto.
// Offline, no secrets, no network. Run: npx tsx tests/wo329_forwarded_host.ts
//
// Prod bug: behind the WO-323 self-host edge (Next standalone behind Caddy +
// cloudflared, no Vercel host-injection), request.nextUrl.host / request.url
// resolve to the internal localhost:3000. The unconfirmed-user guard in
// updateSession() built its /login redirect off nextUrl.clone(), so logged-out
// visitors to /dashboard got bounced to a dead https://localhost:3000/login.
//
// (A) drives the ONE call site that's reachable without a live session — no
// cookies means supabase-js's getUser() returns { user: null } without a
// network call (see auth-js GoTrueClient._getUser), so this exercises the
// REAL updateSession() end to end, not a source-string proxy for it.
// (B) the other three redirect-emitting sites (go()/portal, signed-in-at-
// /login, and the sibling sign-out route) need a live confirmed session to
// reach — asserted as source contracts instead, same convention as
// tests/wo50_auth_flows.ts, so a regression to nextUrl.clone()/request.url
// on any of them still fails this suite.
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed++;
}
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

async function main() {
  // ── (A) real behavioral call: logged-out /dashboard/... through the forwarded edge ──
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fake.supabase.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fake-anon-key";
  const { updateSession } = await import("../src/lib/supabase/middleware");

  const req = new NextRequest("http://internal-localhost:3000/dashboard/cases?tab=x", {
    headers: { "x-forwarded-host": "mukadma.in", "x-forwarded-proto": "https" },
  });
  const res = await updateSession(req);
  const location = res.headers.get("location");

  ok("logged-out /dashboard: 307 redirect fires", res.status === 307);
  ok("logged-out /dashboard: Location uses the forwarded public origin", location === "https://mukadma.in/login?next=%2Fdashboard%2Fcases%3Ftab%3Dx");
  ok("logged-out /dashboard: never leaks the internal host", !!location && !location.includes("localhost"));

  // bare /dashboard (no sub-path) never sets ?next= (existing WO-50 contract) but still
  // must resolve to the public host, not the internal one.
  const reqBare = new NextRequest("http://internal-localhost:3000/dashboard", {
    headers: { "x-forwarded-host": "app.mukadma.in", "x-forwarded-proto": "https" },
  });
  const resBare = await updateSession(reqBare);
  ok("logged-out bare /dashboard: Location is the public host, no ?next=", resBare.headers.get("location") === "https://app.mukadma.in/login");

  // ── (B) source contracts for the sites a session-less test can't reach ──
  const mw = src("src/lib/supabase/middleware.ts");
  ok("middleware: imports requestOrigin from the shared helper", mw.includes('import { postAuthPath, requestOrigin } from "@/lib/auth/redirects"'));
  ok("middleware: unconfirmed-guard redirect uses requestOrigin", /const url = new URL\("\/login", requestOrigin\(request\.headers\)\)/.test(mw));
  ok("middleware: portal go() helper uses requestOrigin", /const go = \(p: string\) => NextResponse\.redirect\(new URL\(p, requestOrigin\(request\.headers\)\)\)/.test(mw));
  ok("middleware: signed-in-at-/login redirect uses requestOrigin", /return NextResponse\.redirect\(new URL\(dest, requestOrigin\(request\.headers\)\)\)/.test(mw));
  ok("middleware: no redirect target still built off nextUrl.clone()/request.url", !mw.includes("nextUrl.clone()") && !/new URL\([^)]*, request\.url\)/.test(mw));

  const signout = src("src/app/auth/signout/route.ts");
  ok("signout: redirect uses requestOrigin, not request.url", signout.includes('new URL("/login", requestOrigin(request.headers))') && !signout.includes('new URL("/login", request.url)'));

  console.log(failed ? `WO-329 FORWARDED HOST: FAIL (${failed})` : "WO-329 FORWARDED HOST: PASS");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("THROWN", e);
  process.exit(1);
});
