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
    return { ok: false, message: "Couldn't generate a summary — the AI backend isn't available in this environment." };
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
    parsed_text: text || null,
    matter_id: matterId,
    extracted: { needsOcr: needsOcr ?? false } as Database["public"]["Tables"]["document"]["Insert"]["extracted"],
  });
  await supabase.from("audit_event").insert({ tenant_id: tenantId, action: "document.upload", entity: "matter", entity_id: matterId, after: { filename: file.name } });
  await logActivity(supabase, tenantId, { matterId, type: "document.uploaded", summary: `Document “${file.name}” uploaded` });
  revalidatePath(`/dashboard/cases/${matterId}`);
  return { ok: true, message: `Added “${file.name}” to the case.` };
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
