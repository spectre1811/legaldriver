"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/court/sync";
import { logActivity } from "@/lib/activity";
import { fileUploadedDocument } from "@/lib/docs/file-upload";
import { extractText } from "@/lib/docs/extract";
import { sha256Hex } from "@/lib/docs/hash";
import type { Database } from "@/lib/db/database.types";

export type ActionResult = { ok: boolean; message: string };

// Delete a client. FKs SET NULL on matters/documents/notices/ip/messages (they
// SURVIVE, unlinked — cases aren't deleted, just unclient'd) and CASCADE the portal
// user + portal messages (access is revoked). Tenant-scoped via RLS.
export async function deleteClient(clientId: string): Promise<ActionResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };
  const { error } = await supabase.from("client").delete().eq("id", clientId);
  if (error) return { ok: false, message: error.message };
  await supabase.from("audit_event").insert({ tenant_id: tenantId, action: "client.delete", entity: "client", entity_id: clientId });
  revalidatePath("/dashboard/clients");
  return { ok: true, message: "Client deleted. Their cases and documents were kept (unlinked)." };
}

// Invite a client to the portal: create a portal auth user (is_portal=true so the
// firm-bootstrap trigger skips it) and link it to this client. Firm sets the initial
// password to share. RLS confines the portal user to this client only.
export async function inviteToPortal(clientId: string, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "").trim();
  if (!email || password.length < 8) return { ok: false, message: "Email and a password (8+ chars) are required." };

  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };
  // Confirm the client belongs to this tenant (RLS-scoped read).
  const { data: client } = await supabase.from("client").select("id, name").eq("id", clientId).maybeSingle();
  if (!client) return { ok: false, message: "Client not found." };

  const admin = createAdminClient();
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { is_portal: true, full_name: client.name },
  });
  if (error || !created.user) return { ok: false, message: error?.message ?? "Could not create portal user." };

  const { error: linkErr } = await admin.from("portal_user").insert({ id: created.user.id, tenant_id: tenantId, client_id: clientId });
  if (linkErr) {
    await admin.auth.admin.deleteUser(created.user.id); // roll back the orphan auth user
    return { ok: false, message: `Could not link portal access: ${linkErr.message}` };
  }
  await logActivity(supabase, tenantId, { type: "portal.invite", summary: `Portal access granted to ${email} for ${client.name}` });
  await supabase.from("audit_event").insert({ tenant_id: tenantId, action: "portal.invite", entity: "client", entity_id: clientId, after: { email } });
  revalidatePath(`/dashboard/clients/${clientId}`);
  return { ok: true, message: `Portal access created for ${email}. Share the credentials securely — they sign in at the normal login.` };
}

export async function revokePortal(portalUserId: string, clientId: string): Promise<ActionResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };
  const admin = createAdminClient();
  // portal_user RLS (firm) scopes to tenant; delete the mapping + the auth user.
  const { data: pu } = await supabase.from("portal_user").select("id").eq("id", portalUserId).maybeSingle();
  if (!pu) return { ok: false, message: "Not found." };
  await admin.from("portal_user").delete().eq("id", portalUserId);
  await admin.auth.admin.deleteUser(portalUserId);
  await supabase.from("audit_event").insert({ tenant_id: tenantId, action: "portal.revoke", entity: "client", entity_id: clientId });
  revalidatePath(`/dashboard/clients/${clientId}`);
  return { ok: true, message: "Portal access revoked." };
}

// Bulk-upload one or more files directly to a client (client_id set, no case).
// Each file is content-hashed; an exact duplicate (same tenant + content_hash)
// already in the library is skipped rather than re-stored.
export async function uploadClientDocuments(clientId: string, formData: FormData): Promise<ActionResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };
  const { data: client } = await supabase.from("client").select("id, name").eq("id", clientId).maybeSingle();
  if (!client) return { ok: false, message: "Client not found." };

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { ok: false, message: "Choose at least one file to upload." };

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    if (file.size > 25 * 1024 * 1024) { failed++; continue; }
    const buffer = Buffer.from(await file.arrayBuffer());
    // WO-27 — shared path: store + dedup + extract + CLASSIFY, with the client as explicit context
    // (the human chose it, so it's respected — never overridden). Adds doc_type/summary a manual
    // upload didn't get before.
    const r = await fileUploadedDocument({
      tenantId,
      buffer,
      mime: file.type,
      filename: file.name,
      pathPrefix: `client/${clientId}`,
      context: { clientId },
    });
    if (!r.ok) failed++;
    else if (r.status === "duplicate") skipped++;
    else uploaded++;
  }

  if (uploaded) {
    await logActivity(supabase, tenantId, { type: "document.uploaded", summary: `${uploaded} document(s) uploaded to ${client.name}` });
    await supabase.from("audit_event").insert({ tenant_id: tenantId, action: "document.upload", entity: "client", entity_id: clientId, after: { uploaded, skipped, failed } });
  }
  revalidatePath(`/dashboard/clients/${clientId}`);

  const parts = [`${uploaded} uploaded`];
  if (skipped) parts.push(`${skipped} skipped (duplicate)`);
  if (failed) parts.push(`${failed} failed`);
  return { ok: uploaded > 0 || skipped > 0, message: parts.join(" · ") + "." };
}

export async function sendFirmMessage(clientId: string, formData: FormData): Promise<ActionResult> {
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { ok: false, message: "Type a message." };
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };
  const { error } = await supabase.from("portal_message").insert({
    tenant_id: tenantId, client_id: clientId, sender: "firm", sender_user_id: user?.id ?? null, body,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/dashboard/clients/${clientId}`);
  return { ok: true, message: "Sent." };
}
