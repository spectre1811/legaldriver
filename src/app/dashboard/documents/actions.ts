"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/court/sync";
import { logActivity } from "@/lib/activity";
import { categoryOf } from "@/lib/docs/categories";

export type DocResult = { ok: boolean; message: string };

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
