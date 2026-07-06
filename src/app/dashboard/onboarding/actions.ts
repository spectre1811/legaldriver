"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/court/sync";
import { runOnboarding, drainOnboarding, seedFetchedMatters, DRAIN_BUDGET_MS, type OnboardingCounts } from "@/lib/services/onboarding/orchestrator";
import { enabledAdvocateProviders } from "@/lib/court/advocate-cases";
import { diagnoseEmptyRoster } from "@/lib/court/bar-number";
import type { Database } from "@/lib/db/database.types";

// `done` (BP-73): false while a large roster is still draining in bounded chunks — the client keeps
// calling `continueOnboarding(runId)` until it flips true. Absent/true on the single-shot completion path.
export type OnboardingActionResult = { ok: boolean; message: string; runId?: string; done?: boolean };

// BP-71 W2: the live status of the advocate's most-recent onboarding run, for the progress bar. Reads the
// record `runOnboarding` writes stage-by-stage (RLS scopes to the tenant automatically via the server
// client). The UI polls this while `startOnboarding` runs so the user sees real progress, not a spinner.
export type OnboardingStatus = {
  stage: string; status: string; counts: Record<string, number>; message: string | null; updatedAt: string;
} | null;

export async function getOnboardingStatus(advocateId: string): Promise<OnboardingStatus> {
  const supabase = createClient();
  const { data } = await supabase
    .from("onboarding_run")
    .select("stage, status, counts, message, updated_at")
    .eq("advocate_id", advocateId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    stage: data.stage, status: data.status,
    counts: (data.counts ?? {}) as Record<string, number>,
    message: data.message, updatedAt: data.updated_at,
  };
}

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
  // WO-58: a zero when NO court-data source is configured is not "you have no cases" — it's a
  // deployment gap. Say so first (and actionably), before the enrolment-quality diagnostics below.
  if (enabledAdvocateProviders().length === 0) {
    return " No cases were auto-fetched because no court-data source is configured here — an administrator must set LD_API_KEY (see FOUNDER-ACTIONS #1). Your cause list and add-by-CNR still work.";
  }
  const { data: adv } = await supabase.from("advocate").select("bar_registration_number, state_code").eq("id", advocateId).maybeSingle();
  const reason = diagnoseEmptyRoster(adv?.bar_registration_number, adv?.state_code);
  switch (reason.kind) {
    case "unparsed":
      return " No cases were auto-fetched — add the advocate's full enrolment number with year (e.g. G/702/2020) in Settings for an exact eCourts roster pull.";
    case "unverified":
      return ` No cases were auto-fetched — live eCourts roster search isn't available for the ${reason.council} State Bar Council yet, so we resolved by name only. Add cases by CNR, or check back as more councils go live.`;
    case "no-results":
      // We searched the High Court + the main district complex — deliberately NOT claiming
      // "no cases exist", because we haven't yet searched every Gujarat district.
      return " No cases found in the High Court or the main district complex for this enrolment number. Wider district coverage is rolling out — meanwhile double-check the serial and year, or add cases directly by CNR.";
  }
}

// The honest terminal summary shown when onboarding finishes. If neither the roster fetch nor the
// cause-list found anything, appends WHY (empty-roster note) instead of a bare "0" that reads as "this
// advocate has none". Shared by the single-shot (`startOnboarding`) and resumable (`continueOnboarding`)
// completion paths so both report identically.
async function finishMessage(supabase: ReturnType<typeof createClient>, advocateId: string, counts: OnboardingCounts): Promise<string> {
  const note = counts.cases_fetched === 0 && counts.matters_seeded === 0 ? await emptyRosterNote(supabase, advocateId) : "";
  return `Done — ${counts.cases_fetched} cases auto-fetched, ${counts.matters_seeded} from cause-list, ${counts.enriched} enriched, ${counts.deadlines_proposed} deadlines proposed, ${counts.inbox_filed} emails filed, ${counts.docs_attached} docs auto-filed, ${counts.closed_found} closed cases found, ${counts.summaries_queued} AI briefings queued.${note}`;
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
    return { ok: true, runId: run.id, done: true, message: await finishMessage(supabase, advocateId, counts) };
  } catch (e) {
    await supabase.from("onboarding_run").update({ status: "error", message: e instanceof Error ? e.message : "failed", updated_at: new Date().toISOString() }).eq("id", run.id);
    revalidatePath("/dashboard/onboarding");
    return { ok: false, runId: run.id, message: "Onboarding hit an error — partial progress saved; you can re-run." };
  }
}

// BP-73: resume an in-flight onboarding run in bounded chunks. On Vercel Hobby a server action is
// hard-capped at 60s, so a large roster (≥255 cases) can't enrich everything in one call — `drainOnboarding`
// does ~45s of work then returns `done:false`, and the client keeps calling this until `done:true`
// (a daily cron backstop finishes any run the user abandoned). Idempotent + safe to call repeatedly:
// every stage is idempotent and the run's stage+cursor track exactly where to resume.
export async function continueOnboarding(runId: string): Promise<OnboardingActionResult> {
  const supabase = createClient();
  const admin = createAdminClient();
  try {
    const res = await drainOnboarding(supabase, admin, runId, { budgetMs: DRAIN_BUDGET_MS });
    revalidatePath("/dashboard/onboarding");
    if (!res.done) {
      return { ok: true, runId, done: false, message: "Fetching and enriching your cases — this keeps running; they appear as they’re ready." };
    }
    const { data: run } = await supabase.from("onboarding_run").select("advocate_id").eq("id", runId).maybeSingle();
    const message = run?.advocate_id ? await finishMessage(supabase, run.advocate_id, res.counts) : "Onboarding complete.";
    return { ok: true, runId, done: true, message };
  } catch (e) {
    await supabase.from("onboarding_run").update({ status: "error", message: e instanceof Error ? e.message : "failed", updated_at: new Date().toISOString() }).eq("id", runId);
    revalidatePath("/dashboard/onboarding");
    return { ok: false, runId, done: false, message: "Onboarding hit an error — partial progress saved; you can re-run." };
  }
}

// WO-58: harvest cases the background fleet has since ingested into our warehouse INTO the tenant. The
// live roster refresh (`startLiveAdvocateRefresh`) is async — the rotating-IP fleet stores the advocate's
// cases in our warehouse over the following minutes. This re-reads the warehouse (WAREHOUSE-ONLY,
// `live:false` — never a live eCourts burst) and seeds any newly-available matters, bumping the latest
// run's `cases_fetched`. Safe + cheap to call repeatedly; the UI polls it while a fetch is pending so a
// cold advocate fills in without the user re-running. Returns how many NEW matters were seeded this call.
export async function harvestOnboarding(advocateId: string): Promise<{ added: number }> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { added: 0 };

  const { data: adv } = await supabase.from("advocate").select("name, bar_registration_number, state_code").eq("id", advocateId).maybeSingle();
  if (!adv) return { added: 0 };

  const { fetchAdvocateCases } = await import("@/lib/court/advocate-cases");
  const cases = await fetchAdvocateCases({ name: adv.name, barNumber: adv.bar_registration_number, stateCode: adv.state_code, live: false });
  const added = await seedFetchedMatters(supabase, tenantId, cases);
  if (added > 0) {
    const { data: run } = await supabase.from("onboarding_run").select("id, counts").eq("advocate_id", advocateId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (run) {
      const counts = { ...((run.counts as Record<string, number> | null) ?? {}) };
      counts.cases_fetched = (counts.cases_fetched ?? 0) + added;
      await supabase.from("onboarding_run")
        .update({ counts: counts as unknown as Database["public"]["Tables"]["onboarding_run"]["Update"]["counts"], updated_at: new Date().toISOString() })
        .eq("id", run.id);
    }
    revalidatePath("/dashboard/onboarding");
    revalidatePath("/dashboard/cases");
    revalidatePath("/dashboard/calendar");
  }
  return { added };
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
