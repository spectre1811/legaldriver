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

// ── WO-33 Wave 1 · Review Inbox — resolve a needs-review document ──────────────────────────
// Files a document (to a case and/or client) from the Review Inbox and marks it reviewed
// (`extracted.status = 'filed'`), so it leaves the queue. Reuses the soft-flag-in-JSON tactic (no
// migration). This is the human-in-the-loop confirm for the intake engine.
export async function resolveReview(documentId: string, matterId: string | null, clientId: string | null): Promise<DocResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };
  const { data: doc } = await supabase.from("document").select("extracted").eq("id", documentId).maybeSingle();
  if (!doc) return { ok: false, message: "Not found." };
  const ex = { ...((doc.extracted as Record<string, unknown>) ?? {}), status: "filed" };
  const patch: { matter_id: string | null; client_id: string | null; extracted: unknown } = { matter_id: matterId, client_id: clientId, extracted: ex };
  const { error } = await supabase.from("document").update(patch as never).eq("id", documentId); // RLS-scoped
  if (error) return { ok: false, message: error.message };
  await supabase.from("audit_event").insert({ tenant_id: tenantId, action: "document.reviewed", entity: "document", entity_id: documentId });
  if (matterId) await logActivity(supabase, tenantId, { matterId, type: "document.filed", summary: "Document filed from review" });
  revalidatePath("/dashboard/documents/review");
  revalidatePath("/dashboard/documents");
  return { ok: true, message: matterId ? "Filed to case." : clientId ? "Filed to client." : "Filed." };
}

// ── WO-27 Wave 2 · bulk + reversible delete ───────────────────────────────────────────────
// Reversible delete uses a soft-delete flag in `extracted.deletedAt` (no schema migration): the
// main list hides flagged rows, the Trash view shows them, restore clears the flag, and a hard
// purge (storage + row) only happens from Trash. This keeps delete UNDOABLE without a founder-gated
// migration.

async function setDeletedAt(supabase: ReturnType<typeof createClient>, ids: string[], value: string | null) {
  const { data: rows } = await supabase.from("document").select("id, extracted").in("id", ids); // RLS-scoped
  let n = 0;
  for (const r of rows ?? []) {
    const ex = { ...((r.extracted as Record<string, unknown>) ?? {}) };
    if (value) ex.deletedAt = value; else delete ex.deletedAt;
    const { error } = await supabase.from("document").update({ extracted: ex as never }).eq("id", r.id);
    if (!error) n++;
  }
  return n;
}

// Soft-delete N documents (reversible). Returns the count so the UI can offer Undo.
export async function bulkDeleteDocuments(ids: string[]): Promise<DocResult & { count: number }> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant.", count: 0 };
  if (!ids.length) return { ok: false, message: "Nothing selected.", count: 0 };
  const n = await setDeletedAt(supabase, ids, new Date().toISOString());
  await supabase.from("audit_event").insert({ tenant_id: tenantId, action: "document.trash", entity: "document", after: { count: n } });
  revalidatePath("/dashboard/documents");
  return { ok: n > 0, message: `${n} moved to Trash.`, count: n };
}

// Restore soft-deleted documents (the Undo action + the Trash "Restore" button).
export async function restoreDocuments(ids: string[]): Promise<DocResult & { count: number }> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant.", count: 0 };
  const n = await setDeletedAt(supabase, ids, null);
  revalidatePath("/dashboard/documents");
  return { ok: n > 0, message: `${n} restored.`, count: n };
}

// Permanently remove documents — storage object + row. Only reachable from the Trash view.
export async function purgeDocuments(ids: string[]): Promise<DocResult & { count: number }> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant.", count: 0 };
  const { data: rows } = await supabase.from("document").select("id, storage_path").in("id", ids);
  const admin = createAdminClient();
  let n = 0;
  for (const r of rows ?? []) {
    if (r.storage_path) await admin.storage.from("documents").remove([r.storage_path]);
    const { error } = await supabase.from("document").delete().eq("id", r.id);
    if (!error) n++;
  }
  await supabase.from("audit_event").insert({ tenant_id: tenantId, action: "document.purge", entity: "document", after: { count: n } });
  revalidatePath("/dashboard/documents");
  return { ok: n > 0, message: `${n} permanently deleted.`, count: n };
}

// File N documents to a CLIENT at once (client-first bulk filing; leaves any case tag intact).
export async function bulkFileToClient(ids: string[], clientId: string): Promise<DocResult & { count: number }> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId || !clientId) return { ok: false, message: "No tenant/client.", count: 0 };
  const { error, count } = await supabase.from("document").update({ client_id: clientId }, { count: "exact" }).in("id", ids);
  if (error) return { ok: false, message: error.message, count: 0 };
  revalidatePath("/dashboard/documents");
  return { ok: true, message: `${count ?? ids.length} filed to client.`, count: count ?? ids.length };
}

// Tag N documents to a CASE at once (leaves the client as-is; the case→client join resolves display).
export async function bulkFileToCase(ids: string[], matterId: string): Promise<DocResult & { count: number }> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId || !matterId) return { ok: false, message: "No tenant/case.", count: 0 };
  const { error, count } = await supabase.from("document").update({ matter_id: matterId }, { count: "exact" }).in("id", ids);
  if (error) return { ok: false, message: error.message, count: 0 };
  revalidatePath("/dashboard/documents");
  return { ok: true, message: `${count ?? ids.length} filed to case.`, count: count ?? ids.length };
}

// Bulk export was reworked in WO-27 W3 into a single-zip download served by
// `/api/documents/export` (route handler streams a real archive), replacing the old
// per-file "open a signed URL in a new tab" approach that browsers blocked past one file.

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
