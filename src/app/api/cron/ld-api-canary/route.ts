import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { probeLdApi, CANARY_BAR_ID, CANARY_PROVIDER } from "@/lib/court/ld-api-canary";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// WO-64 · Synthetic LD-API auth canary. Vercel Cron hits this with `Authorization: Bearer <CRON_SECRET>`
// (same contract as the other crons). It probes the box with the prod key for a known advocate and
// writes an OK/ALARM row to `court_provider_health` under provider "legaldriver-canary" — the surface
// `getProviderHealth()` already reads for diagnostics/fleet health. So a 401 / empty / unreachable box
// now leaves a durable, queryable signal instead of the silence that hid the incident for days.
//
// It also returns a non-2xx body on alarm, so it doubles as an ON-DEMAND probe an external uptime
// monitor (or the fleet) can hit at a tighter cadence than the daily cron. WO-63's deploy-freshness
// alarm can piggyback on the same health row.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const outcome = await probeLdApi();

  const admin = createAdminClient();
  await admin.from("court_provider_health").upsert(
    {
      provider: CANARY_PROVIDER,
      ok: outcome.ok,
      // Short, PII-free reason only (never a response body) — matches the gateway's health convention.
      last_error: outcome.ok ? null : `[${outcome.kind}] ${outcome.detail}`.slice(0, 200),
      ...(outcome.ok ? { last_ok_at: new Date().toISOString() } : {}),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider" },
  );

  return NextResponse.json(
    { ok: outcome.ok, provider: CANARY_PROVIDER, bar_id: CANARY_BAR_ID, kind: outcome.kind, status: outcome.status, cases: outcome.caseCount, detail: outcome.detail },
    { status: outcome.ok ? 200 : 503 }, // red status so logs / external pings see the alarm too
  );
}
