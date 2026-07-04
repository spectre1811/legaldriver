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
    .select("id, refresh_token_ref")
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
    const mail = getGmailClient(accessToken);
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
