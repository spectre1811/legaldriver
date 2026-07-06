import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { drainOnboarding } from "@/lib/services/onboarding/orchestrator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// A run whose client tab drives `continueOnboarding` updates `onboarding_run.updated_at` every few
// seconds. Only pick up runs untouched for a while — those are ABANDONED (tab closed mid-drain) — so the
// backstop never double-drains a run a client is actively finishing (the coordination is the staleness
// gate; drain itself has no cross-process lock). Tune via env.
const STALE_MINUTES = Number(process.env.ONBOARDING_DRAIN_STALE_MINUTES ?? "10");
const MAX_RUNS_PER_TICK = Number(process.env.ONBOARDING_DRAIN_MAX_RUNS ?? "10");
// Leave headroom under maxDuration so the last drain returns before Vercel kills the function.
const TICK_BUDGET_MS = 50_000;
const PER_RUN_BUDGET_MS = 45_000;

// BP-73 backstop. Vercel Cron hits this with `Authorization: Bearer <CRON_SECRET>`. Resumes onboarding
// runs left mid-flight (the user closed the tab before the client finished draining a large roster), so
// enrichment/deadlines/AI still complete for them. Idempotent + bounded: each run's drain is chunked and
// resumable, and the tick stops before the 60s function cap. Service-role client (no user session) — the
// orchestrator scopes every tenant read/write by tenant_id explicitly (CLAUDE.md conv. 1).
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const staleBefore = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();

  // Stalest-first so the most-abandoned runs get unblocked first; status='running' ⟹ non-terminal
  // (done/error runs carry those statuses), so we only ever pick up genuinely-incomplete work.
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
}
