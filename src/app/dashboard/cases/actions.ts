"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCourtDataClient } from "@/lib/court/client";
import { getTenantId, upsertCase } from "@/lib/court/sync";
import { extractText } from "@/lib/docs/extract";
import { completeJson } from "@/lib/ai/complete";
import { buildCaseSummaryPrompt, CASE_SUMMARY_SCHEMA, normalizeCaseSummary } from "@/lib/docs/case-summary";
import { logActivity } from "@/lib/activity";
import type { Database } from "@/lib/db/database.types";

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

  const raw = await completeJson(prompt, CASE_SUMMARY_SCHEMA as unknown as Record<string, unknown>);
  const summary = normalizeCaseSummary(raw);
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
  const admin = createAdminClient();
  const path = `${tenantId}/cases/${matterId}/${Date.now()}_${file.name}`;
  const { error: upErr } = await admin.storage.from("documents").upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: true });
  if (upErr) return { ok: false, message: `Upload failed: ${upErr.message}` };

  const { text, needsOcr } = await extractText(buffer, file.type || "", file.name);
  await admin.from("document").insert({
    tenant_id: tenantId,
    source: "upload",
    storage_path: path,
    filename: file.name,
    mime: file.type || "application/octet-stream",
    size_bytes: buffer.length,
    parsed_text: text || null,
    matter_id: matterId,
    extracted: { needsOcr: needsOcr ?? false } as Database["public"]["Tables"]["document"]["Insert"]["extracted"],
  });
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

export async function addCaseByCnr(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const cnr = String(formData.get("cnr") ?? "").trim().toUpperCase();
  if (cnr.length < 6) return { ok: false, message: "Enter a valid CNR (16 characters)." };

  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant — please sign in again." };

  const court = getCourtDataClient();
  let normalized;
  try {
    normalized = await court.getCaseByCNR(cnr);
  } catch {
    return { ok: false, message: "Court-data provider error. Try again shortly." };
  }
  if (!normalized) {
    return {
      ok: false,
      message: `No case found for ${cnr} via ${court.source}. You can add it manually instead.`,
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

export async function refreshCase(matterId: string): Promise<ActionResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };

  const { data: matter } = await supabase.from("matter").select("cnr").eq("id", matterId).single();
  if (!matter?.cnr) return { ok: false, message: "Matter has no CNR to refresh." };

  const court = getCourtDataClient();
  const [normalized] = await court.refreshCases([matter.cnr]);
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
