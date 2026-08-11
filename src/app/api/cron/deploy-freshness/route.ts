import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkDeployFreshness, FRESHNESS_PROVIDER } from "@/lib/ops/deploy-freshness";
import { withCronLock } from "@/lib/cron/lock";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

// WO-63 · Deploy-freshness alarm. Vercel Cron hits this daily with `Authorization: Bearer <CRON_SECRET>`
// (same contract as every other cron). It compares the running production SHA (VERCEL_GIT_COMMIT_SHA)
// to origin/main HEAD and writes an OK/ALARM row to `court_provider_health` under provider
// "deploy-freshness" — the surface `getProviderHealth()` already reads. So a stalled production deploy
// (merged code not going live — the WO-63 incident) now leaves a durable, queryable signal instead of
// the silence that hid it for days. Mirrors the WO-64 LD-API canary exactly.
//
// It also returns a non-2xx body on alarm, so it doubles as an ON-DEMAND probe an external uptime
// monitor can hit at a tighter cadence than the daily cron for real "prod lags main by > N min"
// detection (the Vercel Hobby cron cap forbids sub-daily schedules — see WO-64).
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return withCronLock("deploy-freshness", async () => {
    const outcome = await checkDeployFreshness();

    // Best-effort health-row write; never let a DB hiccup mask the alarm the HTTP status carries.
    try {
      const admin = createAdminClient();
      await admin.from("court_provider_health").upsert(
        {
          provider: FRESHNESS_PROVIDER,
          ok: outcome.ok,
          last_error: outcome.ok ? null : outcome.detail.slice(0, 200),
          ...(outcome.ok ? { last_ok_at: new Date().toISOString() } : {}),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "provider" },
      );
    } catch {
      // swallow — the returned status below is still an honest alarm for logs/monitors
    }

    return NextResponse.json(
      {
        ok: outcome.ok,
        provider: FRESHNESS_PROVIDER,
        severity: outcome.severity,
        prodSha: outcome.prodShaShort,
        mainSha: outcome.mainShaShort,
        commitsBehind: outcome.commitsBehind,
        oldestUnshippedAgeMin: outcome.oldestUnshippedAgeMin,
        detail: outcome.detail,
      },
      { status: outcome.ok ? 200 : 503 }, // red status so logs / external pings see a stalled deploy too
    );
  });
}
