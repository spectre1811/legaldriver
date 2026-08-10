import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { probeLdApi, CANARY_BAR_ID, CANARY_PROVIDER } from "@/lib/court/ld-api-canary";
import { withCronLock } from "@/lib/cron/lock";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return withCronLock("ld-api-canary", async () => {
    const outcome = await probeLdApi();

    const admin = createAdminClient();
    await admin.from("court_provider_health").upsert(
      {
        provider: CANARY_PROVIDER,
        ok: outcome.ok,
        last_error: outcome.ok ? null : `[${outcome.kind}] ${outcome.detail}`.slice(0, 200),
        ...(outcome.ok ? { last_ok_at: new Date().toISOString() } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider" },
    );

    return NextResponse.json(
      { ok: outcome.ok, provider: CANARY_PROVIDER, bar_id: CANARY_BAR_ID, kind: outcome.kind, status: outcome.status, cases: outcome.caseCount, detail: outcome.detail },
      { status: outcome.ok ? 200 : 503 },
    );
  });
}
