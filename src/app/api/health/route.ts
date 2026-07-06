import { NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // read runtime env every hit; never serve a cached SHA

// WO-63 · Public build-identity endpoint. Answers "is prod running the latest `main`?" in ONE curl:
//   curl -s https://legaldriver.vercel.app/api/health | jq .sha
// then compare to `git rev-parse origin/main`. Vercel injects `VERCEL_GIT_COMMIT_SHA` at build time,
// so this reports the EXACT commit the running deployment was built from. The deploy-freshness cron
// (`/api/cron/deploy-freshness`) automates the same comparison + alarms on a stall.
//
// Intentionally public + secret-free: a 40-char commit hash of a private repo is not sensitive, and a
// health/version probe must be reachable by an uptime monitor without a key. NOTHING secret is echoed.
export function GET() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.trim() || null;
  return NextResponse.json({
    ok: true,
    service: "legaldriver",
    sha,
    shaShort: sha ? sha.slice(0, 7) : null,
    ref: process.env.VERCEL_GIT_COMMIT_REF || null, // deployed branch (production = "main")
    message: process.env.VERCEL_GIT_COMMIT_MESSAGE?.split("\n")[0]?.slice(0, 120) || null,
    env: process.env.VERCEL_ENV || "development", // production | preview | development
    region: process.env.VERCEL_REGION || null,
    time: new Date().toISOString(),
  });
}
