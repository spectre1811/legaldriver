import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMailer } from "@/lib/notify/mailer";
import { runPipeline } from "@/lib/notify/pipeline";
import { withCronLock } from "@/lib/cron/lock";

export const dynamic = "force-dynamic";
// WO-378: this bounds NOTHING on this estate. `maxDuration` is a Vercel platform hint and a
// complete no-op self-hosted — we left Vercel in WO-323, so the handler runs until it returns.
// Kept only so a Vercel deploy of this repo is still capped. What actually bounds the run is the
// per-send AbortSignal (`mailer.ts`) plus the lease fence below.
export const maxDuration = 60;

// Notification send-worker. Cron hits this every 5 min. Picks up due, pending
// notifications and delivers them: email via the WO-148 v2 template system
// (WO-264 — the pre-v2 ad-hoc htmlFor() is gone), in-app marked sent for display.
// Idempotent — each row flips pending -> sent exactly once, and (WO-378) a run that loses its
// lease mid-flight stops before the next send instead of racing its successor.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return withCronLock("notify", async (lease) => {
    const { result, error } = await runPipeline(createAdminClient(), getMailer(), new Date(), lease);
    if (error) return NextResponse.json({ error }, { status: 500 });
    return NextResponse.json(result);
  });
}
