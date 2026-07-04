"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/court/sync";
import { getMockMailClient, getGmailClient } from "@/lib/mail/client";
import { ingestMail } from "@/lib/mail/ingest";
import { readSecret } from "@/lib/mail/vault";
import { refreshAccessToken, googleConfigured } from "@/lib/mail/oauth";
import { isDemoMode } from "@/lib/demo";
import { groupIdsByStatus } from "@/lib/mail/inbox-status";

export type ActionResult = { ok: boolean; message: string };

// Demo path: ingest the mock mailbox through the real pipeline (real Claude
// classification). Uses the admin client server-side (trusted) so Storage +
// inserts work without per-bucket RLS. Lets the inbox demo run with no Gmail.
export async function runMockIngest(): Promise<ActionResult> {
  // Dev/demo only — the button is hidden in prod, and the action itself refuses there too
  // so it can't be invoked directly to inject mock mail into a real tenant (WO-29 review).
  if (process.env.NODE_ENV === "production" && !isDemoMode()) {
    return { ok: false, message: "Demo ingest is disabled." };
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };

  const admin = createAdminClient();
  const mail = getMockMailClient(`${tenantId}`);
  const summary = await ingestMail(admin, tenantId, user.id, mail, null);

  revalidatePath("/dashboard/inbox");
  return {
    ok: true,
    message: `Ingested ${summary.fetched} emails → ${summary.filed} filed, ${summary.needsReview} need review (${summary.documents} documents).`,
  };
}

// Load earlier emails from the connected Gmail (backfill the most recent ~30,
// beyond the new-only incremental fetch). Dedupes against already-ingested mail.
export async function loadEarlierEmails(): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };
  if (!googleConfigured()) return { ok: false, message: "Gmail not configured." };

  const admin = createAdminClient();
  const { data: conn } = await admin
    .from("oauth_connection")
    .select("id, refresh_token_ref, gmail_query")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .eq("provider", "google")
    .eq("status", "active")
    .maybeSingle();
  if (!conn?.refresh_token_ref) return { ok: false, message: "Connect Gmail first." };

  try {
    const refresh = await readSecret(admin, conn.refresh_token_ref);
    if (!refresh) return { ok: false, message: "Could not read credential." };
    const accessToken = await refreshAccessToken(refresh);
    const mail = getGmailClient(accessToken, conn.gmail_query);
    const summary = await ingestMail(admin, tenantId, user.id, mail, null, 30);
    revalidatePath("/dashboard/inbox");
    return {
      ok: true,
      message: `Loaded ${summary.fetched} recent emails (${summary.documents} attachments). New ones added to the queue.`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Backfill failed." };
  }
}

// Confirm a needs-review email: assign client/matter and mark filed.
export async function confirmEmail(
  emailId: string,
  clientId: string | null,
  matterId: string | null,
): Promise<ActionResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };

  await supabase
    .from("email_message")
    .update({
      classified_client_id: clientId,
      classified_matter_id: matterId,
      status: "filed",
    })
    .eq("id", emailId);
  // Propagate to the email's documents that are unassigned.
  await supabase
    .from("document")
    .update({ client_id: clientId, matter_id: matterId })
    .eq("email_message_id", emailId)
    .is("matter_id", null);

  await supabase.from("audit_event").insert({
    tenant_id: tenantId,
    action: "email.confirm_filed",
    entity: "email_message",
    entity_id: emailId,
    after: { client_id: clientId, matter_id: matterId },
  });
  revalidatePath("/dashboard/inbox");
  return { ok: true, message: "Filed." };
}

// ── Inbox bulk actions (WO-29 W2) — soft, reversible. status 'deleted'/'archived' hide the row
// from both lists (the page filters to review/filed) without destroying the record, so an Undo can
// restore the exact prior status. Documents stay filed (a doc belongs to its client/case, not the
// email). RLS scopes email_message to the tenant, so `.in("id", ids)` can't touch another tenant.
export type BulkResult = { ok: boolean; message: string; undo?: { id: string; status: string }[] };

async function bulkSetStatus(ids: string[], status: "archived" | "deleted", action: string, verb: string): Promise<BulkResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };
  const clean = [...new Set(ids)].filter(Boolean);
  if (!clean.length) return { ok: false, message: "Nothing selected." };

  const { data: prior } = await supabase.from("email_message").select("id, status").in("id", clean);
  const { error } = await supabase.from("email_message").update({ status }).in("id", clean);
  if (error) return { ok: false, message: error.message };
  await supabase.from("audit_event").insert({ tenant_id: tenantId, action, entity: "email_message", entity_id: clean[0], after: { ids: clean, status } });
  revalidatePath("/dashboard/inbox");
  const n = prior?.length ?? clean.length;
  return { ok: true, message: `${verb} ${n} email${n === 1 ? "" : "s"}.`, undo: (prior ?? []).map((p) => ({ id: p.id, status: p.status })) };
}

export async function deleteEmails(ids: string[]): Promise<BulkResult> {
  return bulkSetStatus(ids, "deleted", "email.delete", "Deleted");
}
export async function archiveEmails(ids: string[]): Promise<BulkResult> {
  return bulkSetStatus(ids, "archived", "email.archive", "Archived");
}

// Undo — restore each email to its exact prior status (grouped so one UPDATE per status).
export async function restoreEmails(entries: { id: string; status: string }[]): Promise<ActionResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };
  if (!entries.length) return { ok: false, message: "Nothing to restore." };
  for (const [status, ids] of groupIdsByStatus(entries)) {
    const { error } = await supabase.from("email_message").update({ status }).in("id", ids);
    if (error) return { ok: false, message: error.message };
  }
  await supabase.from("audit_event").insert({ tenant_id: tenantId, action: "email.restore", entity: "email_message", entity_id: entries[0].id, after: { count: entries.length } });
  revalidatePath("/dashboard/inbox");
  return { ok: true, message: "Restored." };
}

// Set (or clear) the connection's optional Gmail search scope (WO-29 W1b). Empty = ingest all
// (minus the always-on junk exclusion). Applies to future backfills/cold-starts.
export async function setGmailQuery(query: string): Promise<ActionResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const tenantId = await getTenantId(supabase);
  if (!tenantId || !user) return { ok: false, message: "Not signed in." };
  const trimmed = query.trim();
  if (trimmed.length > 500) return { ok: false, message: "Query is too long (max 500 characters)." };
  const { error } = await supabase
    .from("oauth_connection")
    .update({ gmail_query: trimmed || null })
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .eq("provider", "google");
  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard/inbox");
  return { ok: true, message: trimmed ? "Ingestion scope saved." : "Scope cleared — ingesting all mail (minus spam/promotions)." };
}

export async function disconnectGmail(): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };

  await supabase
    .from("oauth_connection")
    .update({ status: "revoked" })
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .eq("provider", "google");
  await supabase.from("audit_event").insert({
    tenant_id: tenantId,
    actor_id: user.id,
    action: "gmail.disconnect",
    entity: "oauth_connection",
  });
  revalidatePath("/dashboard/inbox");
  return { ok: true, message: "Disconnected." };
}
