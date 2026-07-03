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
      message: `Done — ${counts.cases_fetched} cases auto-fetched, ${counts.matters_seeded} from cause-list, ${counts.enriched} enriched, ${counts.deadlines_proposed} deadlines proposed, ${counts.inbox_filed} emails filed, ${counts.docs_attached} docs auto-filed, ${counts.closed_found} closed cases found, ${counts.summaries_queued} AI briefings queued.`,
    };
  } catch (e) {
    await supabase.from("onboarding_run").update({ status: "error", message: e instanceof Error ? e.message : "failed", updated_at: new Date().toISOString() }).eq("id", run.id);
    revalidatePath("/dashboard/onboarding");
    return { ok: false, runId: run.id, message: "Onboarding hit an error — partial progress saved; you can re-run." };
  }
}

// Delete (undo) an onboarding: remove the advocate, its onboarding runs, and the cases
// that were onboarded FROM that advocate. Cases are attributed precisely by the
// advocate's authoritative roster CNRs (re-fetched by bar id) — not by name-match — so
// a namesake's cases are never touched. Deleting a matter cascades hearings/orders/etc.
export async function deleteOnboarding(advocateId: string): Promise<OnboardingActionResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };

  const { data: adv } = await supabase.from("advocate").select("name, bar_code, state_code").eq("id", advocateId).maybeSingle();
  if (!adv) return { ok: false, message: "Advocate not found." };

  let removed = 0;
  try {
    const { fetchAdvocateCases } = await import("@/lib/court/advocate-cases");
    const roster = await fetchAdvocateCases({ name: adv.name, barNumber: adv.bar_code, stateCode: adv.state_code });
    const cnrs = [...new Set(roster.map((c) => c.cnr).filter((c): c is string => !!c))];
    for (let i = 0; i < cnrs.length; i += 100) {
      const { data: del } = await supabase.from("matter").delete().in("cnr", cnrs.slice(i, i + 100)).select("id"); // RLS scopes to tenant
      removed += del?.length ?? 0;
    }
  } catch { /* best-effort case cleanup; advocate + runs still removed below */ }

  await supabase.from("onboarding_run").delete().eq("advocate_id", advocateId);
  const { error } = await supabase.from("advocate").delete().eq("id", advocateId);
  if (error) return { ok: false, message: error.message };

  await supabase.from("audit_event").insert({ tenant_id: tenantId, action: "onboarding.delete", entity: "advocate", entity_id: advocateId });
  revalidatePath("/dashboard/onboarding");
  revalidatePath("/dashboard/cases");
  revalidatePath("/dashboard/calendar");
  return { ok: true, message: `Removed ${adv.name} and ${removed} onboarded case${removed === 1 ? "" : "s"}.` };
}
