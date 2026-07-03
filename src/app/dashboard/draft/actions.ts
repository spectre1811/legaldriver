"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/court/sync";
import { extractText } from "@/lib/docs/extract";
import { sha256Hex } from "@/lib/docs/hash";
import { categoryOf } from "@/lib/docs/categories";
import { resolveSections } from "@/lib/docs/draft/sections";
import { generateDraft, pickTemplate, synthesizeDraft } from "@/lib/services/draft/draft";
import { buildGrounding } from "@/lib/services/draft/retrieve";
import type { Database } from "@/lib/db/database.types";

export type DraftActionResult = { ok: boolean; message: string; draftId?: string; pending?: boolean };
type Json = Database["public"]["Tables"]["draft_version"]["Insert"]["meta"];

// Generate a draft in response to an existing document.
export async function draftFromDocument(documentId: string, opts?: { templateId?: string; sections?: string[]; language?: string }): Promise<DraftActionResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };
  const { data: { user } } = await supabase.auth.getUser();

  const out = await generateDraft(supabase, {
    tenantId, sourceDocumentId: documentId,
    overrideTemplateId: opts?.templateId ?? null, overrideSections: opts?.sections ?? null, language: opts?.language ?? null, userId: user?.id ?? null,
  });
  if (!out) return { ok: false, message: "Could not start the draft (document not found)." };
  if (out.noTemplate) return { ok: true, draftId: out.draftId, message: "No drafting template matches this document's category yet — pick one in the console." };
  revalidatePath("/dashboard/draft");
  return {
    ok: true, draftId: out.draftId, pending: out.pending,
    message: out.pending
      ? `Drafting “${out.templateTitle}” in the background — refresh in a moment.`
      : `Draft “${out.templateTitle}” ready.`,
  };
}

// Upload a file (saved to Storage) and immediately draft a reply to it.
export async function uploadAndDraft(formData: FormData): Promise<DraftActionResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };
  const { data: { user } } = await supabase.auth.getUser();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a file to upload." };
  if (file.size > 25 * 1024 * 1024) return { ok: false, message: "File too large (max 25 MB)." };

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentHash = await sha256Hex(buffer);
  const path = `${tenantId}/drafts/${Date.now()}_${file.name}`;
  // Storage has no RLS policies (deny-by-default), so uploads must go through the
  // service-role admin client (mirrors the case-upload path). We still scope by tenantId.
  const admin = createAdminClient();
  const { error: upErr } = await admin.storage.from("documents").upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: true });
  if (upErr) return { ok: false, message: `Upload failed: ${upErr.message}` };

  const { text, needsOcr } = await extractText(buffer, file.type || "", file.name);
  const { data: doc, error: docErr } = await supabase.from("document").insert({
    tenant_id: tenantId, source: "upload", storage_path: path, filename: file.name,
    mime: file.type || "application/octet-stream", size_bytes: buffer.length, parsed_text: text || null, content_hash: contentHash,
    extracted: { needsOcr: needsOcr ?? false } as Database["public"]["Tables"]["document"]["Insert"]["extracted"],
  }).select("id").single();
  if (docErr || !doc) return { ok: false, message: `Could not save the document: ${docErr?.message ?? ""}` };

  if (needsOcr) {
    // Image-only scan: the worker will OCR it, then it can be drafted. Don't block.
    revalidatePath("/dashboard/draft");
    return { ok: true, message: "Uploaded. It’s a scan — our OCR is reading it; draft once the text is extracted." };
  }
  return draftFromDocument(doc.id);
}

// Re-synthesize the draft (optionally with new sections/template) → new version.
export async function regenerateDraft(draftId: string, opts?: { templateId?: string; sections?: string[]; language?: string }): Promise<DraftActionResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };

  const { data: draft } = await supabase.from("draft").select("*").eq("id", draftId).maybeSingle();
  if (!draft || !draft.source_document_id) return { ok: false, message: "Draft or its source document not found." };
  const { data: doc } = await supabase.from("document").select("id, filename, doc_type, parsed_text, matter_id").eq("id", draft.source_document_id).maybeSingle();
  if (!doc) return { ok: false, message: "Source document not found." };

  const category = categoryOf(doc.doc_type, doc.filename);
  const template = await pickTemplate(supabase, tenantId, { category, docType: doc.doc_type, overrideTemplateId: opts?.templateId ?? draft.template_id });
  if (!template) return { ok: false, message: "No template available for this document." };

  const { sections } = resolveSections({
    override: opts?.sections ?? (draft.sections?.length ? draft.sections : null),
    templateDefaults: template.default_sections, sourceText: doc.parsed_text, producesDocType: template.produces_doc_type,
  });
  const language = opts?.language ?? draft.language ?? template.language ?? "en";
  const grounding = await buildGrounding(supabase, {
    tenantId, template, sections, language, sourceText: doc.parsed_text ?? "",
    sourceLabel: `${doc.filename ?? "document"} (${doc.doc_type ?? "?"})`, matterId: doc.matter_id,
  });
  const result = await synthesizeDraft(grounding, { tenantId, matterId: doc.matter_id });
  const nextVersion = await nextVersionNo(supabase, draftId);

  await supabase.from("draft").update({ template_id: template.id, sections, language, produces_doc_type: template.produces_doc_type, status: result ? "draft" : "pending", updated_at: new Date().toISOString() }).eq("id", draftId);

  if (result) {
    await supabase.from("draft_version").insert({
      tenant_id: tenantId, draft_id: draftId, version: nextVersion, body: result.body,
      assumptions: result.assumptions, presumptions: result.presumptions, clarifications: result.clarifications,
      bullet_points: result.bullet_points, citations: result.citations as unknown as Json, generated_by: "llm",
    });
    revalidatePath(`/dashboard/draft/${draftId}`);
    return { ok: true, draftId, message: "Regenerated." };
  }
  await supabase.from("draft_version").insert({ tenant_id: tenantId, draft_id: draftId, version: nextVersion, body: "", generated_by: "llm", meta: { pending: true, grounding } as unknown as Json });
  revalidatePath(`/dashboard/draft/${draftId}`);
  return { ok: true, draftId, pending: true, message: "Regenerating in the background — refresh in a moment." };
}

// Save the advocate's manual edit as a new human-edit version.
export async function saveDraftEdit(draftId: string, body: string): Promise<DraftActionResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };
  const { data: latest } = await supabase.from("draft_version").select("assumptions, presumptions, clarifications, bullet_points, citations").eq("draft_id", draftId).order("version", { ascending: false }).limit(1).maybeSingle();
  const nextVersion = await nextVersionNo(supabase, draftId);
  const { error } = await supabase.from("draft_version").insert({
    tenant_id: tenantId, draft_id: draftId, version: nextVersion, body,
    assumptions: latest?.assumptions ?? [], presumptions: latest?.presumptions ?? [], clarifications: latest?.clarifications ?? [],
    bullet_points: latest?.bullet_points ?? [], citations: (latest?.citations ?? []) as unknown as Json, generated_by: "human-edit",
  });
  if (error) return { ok: false, message: error.message };
  await supabase.from("draft").update({ status: "edited", updated_at: new Date().toISOString() }).eq("id", draftId);
  revalidatePath(`/dashboard/draft/${draftId}`);
  return { ok: true, draftId, message: "Saved." };
}

// Finalise: write the latest body to Storage + create a real document row, so the
// produced draft re-enters the normal document lifecycle. NEVER sends/files to court.
export async function finalizeDraft(draftId: string): Promise<DraftActionResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };
  const { data: draft } = await supabase.from("draft").select("*").eq("id", draftId).maybeSingle();
  if (!draft) return { ok: false, message: "Draft not found." };
  const { data: v } = await supabase.from("draft_version").select("body").eq("draft_id", draftId).order("version", { ascending: false }).limit(1).maybeSingle();
  if (!v?.body) return { ok: false, message: "Nothing to finalise yet." };

  const name = `${(draft.title ?? "draft").replace(/[^\w.-]+/g, "_")}.md`;
  const path = `${tenantId}/drafts/final/${Date.now()}_${name}`;
  const buf = Buffer.from(v.body, "utf8");
  const admin = createAdminClient();
  const { error: upErr } = await admin.storage.from("documents").upload(path, buf, { contentType: "text/markdown", upsert: true });
  if (upErr) return { ok: false, message: `Could not save: ${upErr.message}` };
  await supabase.from("document").insert({
    tenant_id: tenantId, source: "upload", storage_path: path, filename: name, mime: "text/markdown",
    size_bytes: buf.length, parsed_text: v.body, matter_id: draft.matter_id, client_id: draft.client_id,
    content_hash: await sha256Hex(buf), doc_type: draft.produces_doc_type,
    extracted: { draftId, finalized: true } as Database["public"]["Tables"]["document"]["Insert"]["extracted"],
  });
  await supabase.from("draft").update({ status: "finalized", updated_at: new Date().toISOString() }).eq("id", draftId);
  revalidatePath(`/dashboard/draft/${draftId}`);
  revalidatePath("/dashboard/documents");
  return { ok: true, draftId, message: "Finalised and saved as a document." };
}

export async function discardDraft(draftId: string): Promise<DraftActionResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };
  await supabase.from("draft").update({ status: "discarded", updated_at: new Date().toISOString() }).eq("id", draftId);
  revalidatePath("/dashboard/draft");
  return { ok: true, message: "Discarded." };
}

async function nextVersionNo(supabase: ReturnType<typeof createClient>, draftId: string): Promise<number> {
  const { data } = await supabase.from("draft_version").select("version").eq("draft_id", draftId).order("version", { ascending: false }).limit(1).maybeSingle();
  return (data?.version ?? 0) + 1;
}
