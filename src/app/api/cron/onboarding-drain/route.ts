import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { drainOnboarding } from "@/lib/services/onboarding/orchestrator";
import { withCronLock } from "@/lib/cron/lock";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STALE_MINUTES = Number(process.env.ONBOARDING_DRAIN_STALE_MINUTES ?? "4");
const MAX_RUNS_PER_TICK = Number(process.env.ONBOARDING_DRAIN_MAX_RUNS ?? "6");
const TICK_BUDGET_MS = 40_000;
const PER_RUN_BUDGET_MS = 25_000;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return withCronLock("onboarding-drain", async () => {
    const admin = createAdminClient();
    const staleBefore = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();

    const { data: runs, error } = await admin
      .from("onboarding_run")
      .select("id, updated_at")
      .eq("status", "running")
      .lt("updated_at", staleBefore)
      .order("updated_at", { ascending: true })
      .limit(MAX_RUNS_PER_TICK);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const started = Date.now();
    let picked = 0, completed = 0, advanced = 0, deferred = 0;
    for (const run of runs ?? []) {
      if (Date.now() - started > TICK_BUDGET_MS) { deferred++; continue; } // out of budget → next tick
      picked++;
      try {
        const res = await drainOnboarding(admin, admin, run.id, { budgetMs: PER_RUN_BUDGET_MS });
        if (res.done) completed++; else advanced++; // advanced-but-not-done → finishes on a later tick/client
      } catch {
        // Never let one bad run fail the whole tick; its state is persisted + resumable.
        deferred++;
      }
    }

    return NextResponse.json({ ok: true, stale: (runs ?? []).length, picked, completed, advanced, deferred });
  });
}
