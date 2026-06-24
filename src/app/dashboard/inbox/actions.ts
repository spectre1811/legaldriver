"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/court/sync";
import { getMockMailClient } from "@/lib/mail/client";
import { ingestMail } from "@/lib/mail/ingest";

export type ActionResult = { ok: boolean; message: string };

// Demo path: ingest the mock mailbox through the real pipeline (real Claude
// classification). Uses the admin client server-side (trusted) so Storage +
// inserts work without per-bucket RLS. Lets the inbox demo run with no Gmail.
export async function runMockIngest(): Promise<ActionResult> {
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
