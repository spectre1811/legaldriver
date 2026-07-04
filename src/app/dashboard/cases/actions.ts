"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCaseCached } from "@/lib/court/gateway";
import { getTenantId, upsertCase } from "@/lib/court/sync";
import { extractText } from "@/lib/docs/extract";
import { sha256Hex } from "@/lib/docs/hash";
import { aiGateway } from "@/lib/ai/gateway";
import { buildCaseSummaryPrompt, CASE_SUMMARY_SCHEMA, normalizeCaseSummary } from "@/lib/docs/case-summary";
import { logActivity } from "@/lib/activity";
import { track } from "@/lib/analytics/track";
import { fileUploadedDocument } from "@/lib/docs/file-upload";
import { scheduleReminders } from "@/lib/notify/schedule";
import type { Database } from "@/lib/db/database.types";

// Set (or clear) the advocate's diary next-hearing date — overrides a stale/wrong
// synced court date. Reschedules hearing reminders on the EFFECTIVE date.
export async function setDiaryDate(matterId: string, dateStr: string): Promise<ActionResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };
  const override = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : null;
  await supabase.from("matter").update({ next_hearing_override: override }).eq("id", matterId);
  const { data: m } = await supabase.from("matter").select("next_hearing_date, title").eq("id", matterId).maybeSingle();
  const effective = override ?? m?.next_hearing_date ?? null;
  const ref = `matter:${matterId}`;
  await supabase.from("notification").delete().eq("tenant_id", tenantId).eq("kind", "hearing_reminder").eq("status", "pending").contains("payload", { ref });
  if (effective) await scheduleReminders(supabase, tenantId, { kind: "hearing_reminder", eventDate: effective, ref, title: m?.title ?? "Hearing" });
  revalidatePath(`/dashboard/cases/${matterId}`);
  revalidatePath("/dashboard/calendar");
  return { ok: true, message: override ? `Diary date set to ${override}; reminders rescheduled.` : "Diary date cleared; using the court date." };
}

// Confirm a proposed deadline → make it firm ('open') and schedule reminders.
export async function confirmDeadline(deadlineId: string): Promise<ActionResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };
  const { data: d } = await supabase.from("deadline").select("id, matter_id, kind, due_date").eq("id", deadlineId).maybeSingle();
  if (!d) return { ok: false, message: "Deadline not found." };
  await supabase.from("deadline").update({ status: "open" }).eq("id", deadlineId);
  await scheduleReminders(supabase, tenantId, { kind: "deadline_reminder", eventDate: d.due_date, ref: `deadline:${d.id}`, title: d.kind.replace(/_/g, " ") });
  if (d.matter_id) revalidatePath(`/dashboard/cases/${d.matter_id}`);
  return { ok: true, message: "Deadline confirmed and reminders scheduled." };
}

// Dismiss a proposed deadline (advocate judged it inapplicable).
export async function dismissDeadline(deadlineId: string): Promise<ActionResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };
  const { data: d } = await supabase.from("deadline").select("matter_id").eq("id", deadlineId).maybeSingle();
  await supabase.from("deadline").update({ status: "dismissed" }).eq("id", deadlineId);
  if (d?.matter_id) revalidatePath(`/dashboard/cases/${d.matter_id}`);
  return { ok: true, message: "Deadline dismissed." };
}

export type ActionResult = { ok: boolean; message: string };

// Generate (or refresh) the AI summary + next steps for a case. Uses the classifier
// backend (local Claude CLI or API). Stored on matter.ai_summary.
export async function generateCaseSummary(matterId: string): Promise<ActionResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };

  const { data: matter } = await supabase.from("matter").select("*").eq("id", matterId).maybeSingle();
  if (!matter) return { ok: false, message: "Case not found." };
  const [{ data: hearings }, { data: docs }] = await Promise.all([
    supabase.from("hearing").select("date, purpose, judge").eq("matter_id", matterId).order("date", { ascending: false }),
    supabase.from("document").select("filename, doc_type, parsed_text").eq("matter_id", matterId),
  ]);

  const parties = (Array.isArray(matter.parties) ? matter.parties : []) as { name?: string; side?: string; advocate?: string }[];
  const prompt = buildCaseSummaryPrompt({
    title: matter.title,
    cnr: matter.cnr,
    court: matter.court,
    caseType: matter.case_type,
    stage: matter.stage,
    status: matter.status,
    nextHearingDate: matter.next_hearing_date,
    parties,
    hearings: hearings ?? [],
    documents: docs ?? [],
  });

  // AI only via the gateway (04-AI §0). Scope is computed from the session here
  // (tenant-only for a summary) and passed in — the gateway never widens it.
  const res = await aiGateway.run({
    task: "summary.case",
    input: prompt,
    schema: CASE_SUMMARY_SCHEMA as unknown as Record<string, unknown>,
    tenantId,
    scope: { kind: "tenant", tenantId },
  });
  const summary = normalizeCaseSummary(res.output);
  if (!summary) {
    // No synchronous AI backend here (e.g. Vercel) — hand off to the background
    // worker (our Claude Code). Clearing ai_summary makes the worker pick it up.
    await supabase.from("matter").update({ ai_summary: null }).eq("id", matterId);
    await logActivity(supabase, tenantId, { matterId, type: "case.ai_queued", summary: "AI briefing queued for generation" });
    return { ok: true, message: "Queued — our AI is preparing this briefing in the background. Refresh in a minute." };
  }

  await supabase.from("matter").update({ ai_summary: summary as unknown as Database["public"]["Tables"]["matter"]["Update"]["ai_summary"] }).eq("id", matterId);
  await supabase.from("audit_event").insert({ tenant_id: tenantId, action: "case.ai_summary", entity: "matter", entity_id: matterId });
  revalidatePath(`/dashboard/cases/${matterId}`);
  return { ok: true, message: "AI summary updated." };
}

// Upload a document directly to a case (a file not found in email).
export async function addCaseDocument(matterId: string, formData: FormData): Promise<ActionResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };
  const { data: matter } = await supabase.from("matter").select("id").eq("id", matterId).maybeSingle();
  if (!matter) return { ok: false, message: "Case not found." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a file to upload." };
  if (file.size > 25 * 1024 * 1024) return { ok: false, message: "File too large (max 25 MB)." };

  const buffer = Buffer.from(await file.arrayBuffer());
  // WO-27 — shared path: store + dedup + extract + CLASSIFY, with this case as explicit context
  // (respected, never overridden). The upload now gets a doc_type/summary it didn't before.
  // WO-35: also propagate the matter's client_id so the doc lands in the client's library
  // immediately — filing by matter alone left it invisible there until a re-file.
  const { data: m } = await supabase.from("matter").select("client_id").eq("id", matterId).maybeSingle();
  const r = await fileUploadedDocument({
    tenantId,
    buffer,
    mime: file.type,
    filename: file.name,
    pathPrefix: `cases/${matterId}`,
    context: { matterId, clientId: m?.client_id ?? null },
  });
  if (!r.ok) return { ok: false, message: `Upload failed: ${r.error}` };
  if (r.status === "duplicate") return { ok: true, message: `“${file.name}” is already on file — skipped as a duplicate.` };

  await supabase.from("audit_event").insert({ tenant_id: tenantId, action: "document.upload", entity: "matter", entity_id: matterId, after: { filename: file.name } });
  await logActivity(supabase, tenantId, { matterId, type: "document.uploaded", summary: `Document “${file.name}” uploaded` });
  revalidatePath(`/dashboard/cases/${matterId}`);
  return { ok: true, message: `Added “${file.name}” to the case.` };
}

// Log a time entry against a case. Rate = matter override → timekeeper → tenant default.
export async function logTime(matterId: string, formData: FormData): Promise<ActionResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const tenantId = await getTenantId(supabase);
  if (!tenantId || !user) return { ok: false, message: "Not signed in." };

  const minutes = Math.round(Number(formData.get("minutes") ?? 0));
  if (!minutes || minutes <= 0) return { ok: false, message: "Enter minutes worked." };
  const narrative = String(formData.get("narrative") ?? "").trim() || null;
  const billable = String(formData.get("billable") ?? "on") !== "off";
  const entryDate = String(formData.get("entry_date") ?? "").trim() || new Date().toISOString().slice(0, 10);

  const [{ data: matter }, { data: profile }, { data: tenant }] = await Promise.all([
    supabase.from("matter").select("rate_minor").eq("id", matterId).maybeSingle(),
    supabase.from("profile").select("rate_minor").eq("id", user.id).maybeSingle(),
    supabase.from("tenant").select("default_rate_minor").single(),
  ]);
  const rate = matter?.rate_minor ?? profile?.rate_minor ?? tenant?.default_rate_minor ?? 0;

  const { error } = await supabase.from("time_entry").insert({
    tenant_id: tenantId, matter_id: matterId, user_id: user.id,
    entry_date: entryDate, minutes, billable, rate_minor: rate, narrative,
  });
  if (error) return { ok: false, message: error.message };
  await logActivity(supabase, tenantId, { matterId, type: "time.logged", summary: `Logged ${minutes} min${billable ? " (billable)" : ""}` });
  revalidatePath(`/dashboard/cases/${matterId}`);
  return { ok: true, message: "Time logged." };
}

// Log an expense against a case (amount entered in rupees).
export async function logExpense(matterId: string, formData: FormData): Promise<ActionResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const tenantId = await getTenantId(supabase);
  if (!tenantId || !user) return { ok: false, message: "Not signed in." };

  const amount = Number(formData.get("amount") ?? 0);
  if (!amount || amount <= 0) return { ok: false, message: "Enter an amount." };
  const category = String(formData.get("category") ?? "other").trim() || "other";
  const billable = String(formData.get("billable") ?? "on") !== "off";
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const entryDate = String(formData.get("entry_date") ?? "").trim() || new Date().toISOString().slice(0, 10);

  const { error } = await supabase.from("expense").insert({
    tenant_id: tenantId, matter_id: matterId, user_id: user.id,
    entry_date: entryDate, category, amount_minor: Math.round(amount * 100), billable, notes,
  });
  if (error) return { ok: false, message: error.message };
  await logActivity(supabase, tenantId, { matterId, type: "expense.logged", summary: `Expense ${category}: ₹${amount}` });
  revalidatePath(`/dashboard/cases/${matterId}`);
  return { ok: true, message: "Expense logged." };
}

// Manual edit of core case fields (for cases without provider data, or corrections).
export async function updateCase(matterId: string, formData: FormData): Promise<ActionResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };
  const get = (k: string) => { const v = String(formData.get(k) ?? "").trim(); return v === "" ? null : v; };
  const title = get("title");
  if (!title) return { ok: false, message: "Title is required." };
  await supabase.from("matter").update({
    title,
    court: get("court"),
    case_type: get("case_type"),
    stage: get("stage"),
    status: get("status") ?? "active",
    next_hearing_date: get("next_hearing_date"),
  }).eq("id", matterId);
  await supabase.from("audit_event").insert({ tenant_id: tenantId, action: "case.edit", entity: "matter", entity_id: matterId });
  revalidatePath(`/dashboard/cases/${matterId}`);
  return { ok: true, message: "Case updated." };
}

// Track a case by CNR directly (from the advocate/judge browse pages). Fetches
// through the gateway (live LegalDriver) → upserts a matter → returns its id.
export async function trackCaseByCnr(cnr: string): Promise<{ ok: boolean; message: string; matterId?: string }> {
  const clean = (cnr ?? "").trim().toUpperCase();
  if (clean.length < 6) return { ok: false, message: "Invalid CNR." };
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };
  const { data: existing } = await supabase.from("matter").select("id").eq("tenant_id", tenantId).eq("cnr", clean).maybeSingle();
  if (existing) return { ok: true, matterId: existing.id, message: "Already tracked." };
  const fetched = await getCaseCached(clean);
  if (!fetched.case) return { ok: false, message: `No case found for ${clean}.` };
  const { matterId, isNew } = await upsertCase(supabase, tenantId, fetched.case);
  await logActivity(supabase, tenantId, { matterId, type: isNew ? "case.added" : "case.resynced", summary: `Tracked ${clean} from a caseload browse` });
  revalidatePath("/dashboard/cases");
  return { ok: true, matterId, message: "Now tracking this case." };
}

export async function addCaseByCnr(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const cnr = String(formData.get("cnr") ?? "").trim().toUpperCase();
  if (cnr.length < 6) return { ok: false, message: "Enter a valid CNR (16 characters)." };

  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant — please sign in again." };

  // Through the Court Data Gateway: cache-first, provider on miss, stale on error.
  const fetched = await getCaseCached(cnr);
  const normalized = fetched.case;
  if (!normalized) {
    return {
      ok: false,
      message: `No case found for ${cnr} via ${fetched.source}. You can add it manually instead.`,
    };
  }

  const { matterId, isNew, hearingCount } = await upsertCase(supabase, tenantId, normalized);

  await supabase.from("audit_event").insert({
    tenant_id: tenantId,
    action: isNew ? "case.add" : "case.resync",
    entity: "matter",
    entity_id: matterId,
    after: { cnr, source: normalized.source, hearings: hearingCount },
  });
  await logActivity(supabase, tenantId, { matterId, type: isNew ? "case.added" : "case.resynced", summary: isNew ? `Case added by CNR ${cnr}` : `Case re-synced from ${normalized.source}` });

  // Product analytics (WO-15) — the activation event. Safe props only (provider + new-vs-resync);
  // distinctId = tenant uuid, never the CNR/name. No-op unless POSTHOG_KEY is set.
  track("case_added", tenantId, { source: normalized.source, isNew: String(isNew) });

  revalidatePath("/dashboard/cases");
  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard");
  return {
    ok: true,
    message: `${isNew ? "Added" : "Re-synced"} ${normalized.title} — next hearing ${
      normalized.nextHearingDate ?? "n/a"
    } (source: ${normalized.source}).`,
  };
}

// Create a case MANUALLY — for cases the provider can't find (not yet on eCourts,
// pre-filing, or when no live court sync is configured). WO-35 #2: the add-by-CNR
// "add it manually" prompt now leads somewhere real. Minimal by design: title is
// required; court/type/next-date optional. source="manual" so provenance stays honest
// (never labelled as court-sourced) and a later CNR sync can supersede it.
export async function createManualMatter(
  _prev: { ok: boolean; message: string; matterId?: string },
  formData: FormData,
): Promise<{ ok: boolean; message: string; matterId?: string }> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant — please sign in again." };

  const get = (k: string) => { const v = String(formData.get(k) ?? "").trim(); return v === "" ? null : v; };
  const title = get("title");
  if (!title) return { ok: false, message: "Give the case a title (e.g. the party names)." };
  const nextDate = get("next_hearing_date");
  if (nextDate && !/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) return { ok: false, message: "Enter the next hearing date as YYYY-MM-DD." };

  const { data, error } = await supabase
    .from("matter")
    .insert({
      tenant_id: tenantId,
      title,
      court: get("court"),
      case_type: get("case_type"),
      next_hearing_date: nextDate,
      status: "active",
      source: "manual",
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: `Could not create the case: ${error?.message ?? "unknown error"}.` };

  const matterId = data.id;
  if (nextDate) await scheduleReminders(supabase, tenantId, { kind: "hearing_reminder", eventDate: nextDate, ref: `matter:${matterId}`, title });
  await supabase.from("audit_event").insert({ tenant_id: tenantId, action: "case.add_manual", entity: "matter", entity_id: matterId, after: { title } });
  await logActivity(supabase, tenantId, { matterId, type: "case.added", summary: `Case “${title}” added manually` });
  track("case_added", tenantId, { source: "manual", isNew: "true" });
  revalidatePath("/dashboard/cases");
  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard");
  return { ok: true, matterId, message: `Created “${title}”. Add its CNR later to sync live court data.` };
}

// Apply a statutory deadline rule to a case: due_date = base date + rule.days.
// Creates a (human-confirmed) deadline that shows on the calendar. The seeded
// deadline_rule set is jurisdiction-aware (NI-138, CPC, Limitation Act, etc.).
export async function applyDeadlineRule(matterId: string, ruleId: string, baseDate: string): Promise<ActionResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };
  if (!baseDate) return { ok: false, message: "Pick the date the clock starts from." };
  const { data: rule } = await supabase.from("deadline_rule").select("kind, days, description, jurisdiction").eq("id", ruleId).maybeSingle();
  if (!rule) return { ok: false, message: "Rule not found." };
  const d = new Date(`${baseDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return { ok: false, message: "Invalid date." };
  d.setUTCDate(d.getUTCDate() + (rule.days ?? 0));
  const due = d.toISOString().slice(0, 10);
  const { error } = await supabase.from("deadline").insert({
    tenant_id: tenantId, matter_id: matterId, kind: rule.kind, due_date: due,
    jurisdiction_rule: `${rule.jurisdiction}: ${rule.description}`, status: "open",
  });
  if (error) return { ok: false, message: error.message };
  await logActivity(supabase, tenantId, { matterId, type: "deadline.added", summary: `Deadline "${rule.kind}" set for ${due} (${rule.jurisdiction})` });
  revalidatePath(`/dashboard/cases/${matterId}`);
  revalidatePath("/dashboard/calendar");
  return { ok: true, message: `Deadline set: ${rule.kind.replace(/_/g, " ")} due ${due} (${rule.jurisdiction}). Verify against the bare act.` };
}

// Delete a case. The DB FKs do the right thing: hearings, deadlines, time, expenses,
// orders, activity CASCADE (gone with the case); documents/notices/messages/calendar
// SET NULL — they SURVIVE, unlinked (a document belongs to the client, not the case).
export async function deleteMatter(matterId: string): Promise<ActionResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };
  // Clear pending hearing reminders for this matter (notification has no FK; keyed by payload ref).
  await supabase.from("notification").delete().eq("tenant_id", tenantId).eq("status", "pending").contains("payload", { ref: `matter:${matterId}` });
  const { error } = await supabase.from("matter").delete().eq("id", matterId); // RLS scopes to tenant
  if (error) return { ok: false, message: error.message };
  await supabase.from("audit_event").insert({ tenant_id: tenantId, action: "case.delete", entity: "matter", entity_id: matterId });
  revalidatePath("/dashboard/cases");
  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard");
  return { ok: true, message: "Case deleted. Linked documents were kept in the client's library." };
}

export async function refreshCase(matterId: string): Promise<ActionResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };

  const { data: matter } = await supabase.from("matter").select("cnr").eq("id", matterId).single();
  if (!matter?.cnr) return { ok: false, message: "Matter has no CNR to refresh." };

  const normalized = (await getCaseCached(matter.cnr, { force: true })).case;
  if (!normalized) return { ok: false, message: "Refresh returned nothing." };

  await upsertCase(supabase, tenantId, normalized);
  await supabase.from("audit_event").insert({
    tenant_id: tenantId,
    action: "case.refresh",
    entity: "matter",
    entity_id: matterId,
    after: { cnr: matter.cnr, source: normalized.source },
  });
  revalidatePath("/dashboard/cases");
  revalidatePath("/dashboard/calendar");
  return { ok: true, message: `Refreshed (source: ${normalized.source}).` };
}
