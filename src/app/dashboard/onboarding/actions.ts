"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/court/sync";
import { runOnboarding } from "@/lib/services/onboarding/orchestrator";

export type OnboardingActionResult = { ok: boolean; message: string; runId?: string };

// Start (or re-run) onboarding for an advocate. Deterministic stages run inline;
// AI briefings are left to the background worker. Idempotent + safe to re-run.
export async function startOnboarding(advocateId: string): Promise<OnboardingActionResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };

  const { data: run, error } = await supabase.from("onboarding_run").insert({
    tenant_id: tenantId, advocate_id: advocateId, stage: "queued", status: "running",
  }).select("id").single();
  if (error || !run) return { ok: false, message: `Could not start: ${error?.message ?? ""}` };

  try {
    const admin = createAdminClient();
    const counts = await runOnboarding(supabase, admin, { tenantId, advocateId, runId: run.id });
    revalidatePath("/dashboard/onboarding");
    return {
      ok: true, runId: run.id,
      message: `Done — ${counts.matters_seeded} matters seeded, ${counts.enriched} enriched, ${counts.inbox_filed} emails filed, ${counts.closed_found} closed cases found, ${counts.summaries_queued} AI briefings queued.`,
    };
  } catch (e) {
    await supabase.from("onboarding_run").update({ status: "error", message: e instanceof Error ? e.message : "failed", updated_at: new Date().toISOString() }).eq("id", run.id);
    revalidatePath("/dashboard/onboarding");
    return { ok: false, runId: run.id, message: "Onboarding hit an error — partial progress saved; you can re-run." };
  }
}
