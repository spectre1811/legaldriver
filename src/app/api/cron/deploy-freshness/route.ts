import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkDeployFreshness, FRESHNESS_PROVIDER } from "@/lib/ops/deploy-freshness";
import { withCronLock } from "@/lib/cron/lock";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return withCronLock("deploy-freshness", async () => {
    const outcome = await checkDeployFreshness();

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
      { status: outcome.ok ? 200 : 503 },
    );
  });
}
