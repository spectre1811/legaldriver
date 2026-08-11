import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMailer } from "@/lib/notify/mailer";
import { runPipeline } from "@/lib/notify/pipeline";
import { withCronLock } from "@/lib/cron/lock";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Notification send-worker. Vercel Cron hits this daily. Picks up due, pending
// notifications and delivers them: email via the WO-148 v2 template system
// (WO-264 — the pre-v2 ad-hoc htmlFor() is gone), in-app marked sent for display.
// Idempotent — each row flips pending -> sent exactly once.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return withCronLock("notify", async () => {
    const { result, error } = await runPipeline(createAdminClient(), getMailer());
    if (error) return NextResponse.json({ error }, { status: 500 });
    return NextResponse.json(result);
  });
}
