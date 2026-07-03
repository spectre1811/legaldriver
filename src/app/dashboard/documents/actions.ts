"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/court/sync";
import { logActivity } from "@/lib/activity";
import { categoryOf } from "@/lib/docs/categories";
import { fileUploadedDocument } from "@/lib/docs/file-upload";

export type DocResult = { ok: boolean; message: string };

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB / file

// WO-27 — upload straight to the Documents hub. Each file runs the shared extract → classify →
// auto-file path, so a hub upload gets the SAME intelligence as an inbound email: typed, summarised,
// and linked to an existing client/case when confident, else parked in "needs review". Never creates
// a new client/matter from a human upload (suggest, don't force).
export async function uploadDocumentHub(formData: FormData): Promise<DocResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { ok: false, message: "No files selected." };

  let filed = 0, review = 0, failed = 0;
  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) { failed++; continue; }
    const buffer = Buffer.from(await file.arrayBuffer());
    const r = await fileUploadedDocument({ tenantId, buffer, mime: file.type, filename: file.name, pathPrefix: "hub", source: "upload" });
    if (!r.ok) failed++;
    else if (r.status === "filed") filed++;
    else review++;
  }
  revalidatePath("/dashboard/documents");
  const parts = [filed && `${filed} filed`, review && `${review} to review`, failed && `${failed} failed`].filter(Boolean);
  return { ok: filed + review > 0, message: parts.length ? `Uploaded — ${parts.join(", ")}.` : "Upload failed." };
}

// Re-file a document to a different case and/or client (or unfile with empty ids),
// and optionally correct the AI-assigned document type (manual override). A case is
// an OPTIONAL tag here — a document filed to a client alone is a valid, normal state.
export async function relinkDocument(
  documentId: string,
  matterId: string | null,
  clientId: string | null,
  docType?: string | null,
): Promise<DocResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };
  const patch: { matter_id: string | null; client_id: string | null; doc_type?: string | null; category?: string } = { matter_id: matterId, client_id: clientId };
  if (docType !== undefined) {
    const dt = docType?.trim() || null;
    patch.doc_type = dt;
    patch.category = categoryOf(dt);
  }
  const { error } = await supabase.from("document").update(patch).eq("id", documentId); // RLS scopes to tenant
  if (error) return { ok: false, message: error.message };
  if (matterId) await logActivity(supabase, tenantId, { matterId, type: "document.filed", summary: "Document filed to this case" });
  revalidatePath("/dashboard/documents");
  if (clientId) revalidatePath(`/dashboard/clients/${clientId}`);
  if (matterId) revalidatePath(`/dashboard/cases/${matterId}`);
  return { ok: true, message: matterId ? "Filed to case." : clientId ? "Filed to client." : "Unfiled." };
}

// Toggle whether a document is shared with the client portal.
export async function toggleDocShare(documentId: string, shared: boolean): Promise<DocResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };
  const { error } = await supabase.from("document").update({ portal_shared: shared }).eq("id", documentId);
  if (error) return { ok: false, message: error.message };
  await supabase.from("audit_event").insert({ tenant_id: tenantId, action: shared ? "document.share" : "document.unshare", entity: "document", entity_id: documentId });
  revalidatePath("/dashboard/documents");
  return { ok: true, message: shared ? "Shared with client." : "Unshared." };
}

// Delete a document — removes the storage object then the row (tenant-scoped).
export async function deleteDocument(documentId: string): Promise<DocResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };

  const { data: doc } = await supabase.from("document").select("storage_path, matter_id").eq("id", documentId).maybeSingle();
  if (!doc) return { ok: false, message: "Not found." };

  if (doc.storage_path) {
    const admin = createAdminClient();
    await admin.storage.from("documents").remove([doc.storage_path]);
  }
  const { error } = await supabase.from("document").delete().eq("id", documentId);
  if (error) return { ok: false, message: error.message };

  await supabase.from("audit_event").insert({ tenant_id: tenantId, action: "document.delete", entity: "document", entity_id: documentId });
  revalidatePath("/dashboard/documents");
  if (doc.matter_id) revalidatePath(`/dashboard/cases/${doc.matter_id}`);
  return { ok: true, message: "Deleted." };
}
