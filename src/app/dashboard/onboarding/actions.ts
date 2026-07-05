"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/court/sync";
import { runOnboarding } from "@/lib/services/onboarding/orchestrator";
import { diagnoseEmptyRoster } from "@/lib/court/bar-number";

export type OnboardingActionResult = { ok: boolean; message: string; runId?: string };

// WO-42: never present a bare "0 cases" as truth — when a roster fetch found nothing,
// say WHY (missing year / council not live yet / we only searched a subset of courts)
// so the advocate isn't misled into thinking they have no cases when the query was
// simply under-specified OR when we didn't search every court they could appear in.
//
// IMPORTANT (WO-42 district-coverage caveat): the live bar search today covers the High
// Court fully but only the MAIN district complex (one `court_code_arr`) — NOT every
// Gujarat district. So a "0 results" is NOT proof of "no cases" for a district advocate;
// we must say so, not imply a clean zero. Full district coverage is tracked in BACKLOG §D.
async function emptyRosterNote(supabase: ReturnType<typeof createClient>, advocateId: string): Promise<string> {
  const { data: adv } = await supabase.from("advocate").select("bar_registration_number, state_code").eq("id", advocateId).maybeSingle();
  const reason = diagnoseEmptyRoster(adv?.bar_registration_number, adv?.state_code);
  switch (reason.kind) {
    case "unparsed":
      return " No cases were auto-fetched — add the advocate's full enrolment number with year (e.g. GUJ/11240/2025) in Settings for an exact eCourts roster pull.";
    case "unverified":
      return ` No cases were auto-fetched — live eCourts roster search isn't available for the ${reason.council} State Bar Council yet, so we resolved by name only. Add cases by CNR, or check back as more councils go live.`;
    case "no-results":
      // We searched the High Court + the main district complex — deliberately NOT claiming
      // "no cases exist", because we haven't yet searched every Gujarat district.
      return " No cases found in the High Court or the main district complex for this enrolment number. Wider district coverage is rolling out — meanwhile double-check the serial and year, or add cases directly by CNR.";
  }
}

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
    // Honest empty-state: if neither the roster fetch nor the cause-list found anything,
    // explain why instead of reporting a clean "0" that reads as "this advocate has none".
    const note = counts.cases_fetched === 0 && counts.matters_seeded === 0 ? await emptyRosterNote(supabase, advocateId) : "";
    return {
      ok: true, runId: run.id,
      message: `Done — ${counts.cases_fetched} cases auto-fetched, ${counts.matters_seeded} from cause-list, ${counts.enriched} enriched, ${counts.deadlines_proposed} deadlines proposed, ${counts.inbox_filed} emails filed, ${counts.docs_attached} docs auto-filed, ${counts.closed_found} closed cases found, ${counts.summaries_queued} AI briefings queued.${note}`,
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

  const { data: adv } = await supabase.from("advocate").select("name, bar_registration_number, state_code").eq("id", advocateId).maybeSingle();
  if (!adv) return { ok: false, message: "Advocate not found." };

  let removed = 0;
  try {
    const { fetchAdvocateCases } = await import("@/lib/court/advocate-cases");
    // WO-42: same parsed enrollment as onboarding (warehouse read — no live re-ingest on delete).
    const roster = await fetchAdvocateCases({ name: adv.name, barNumber: adv.bar_registration_number, stateCode: adv.state_code });
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
