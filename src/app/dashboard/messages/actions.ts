"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";
import { getMessagingClient } from "@/lib/services/messaging/client";
import { logActivity } from "@/lib/activity";
import type { Database } from "@/lib/db/database.types";

export type SendResult = { ok: boolean; message: string };

// Send an outbound message via the messaging gateway and record it on the matter.
// On the mock provider this just records the row (status 'sent'). RLS-scoped: the
// row is inserted under the caller's session, so tenant isolation is enforced.
// NEVER log the message body.
export async function sendMessage(
  to: string,
  channel: "whatsapp",
  body: string,
): Promise<SendResult> {
  const trimmedTo = to.trim();
  const trimmedBody = body.trim();
  if (!trimmedTo) return { ok: false, message: "Recipient number is required." };
  if (!trimmedBody) return { ok: false, message: "Message body is empty." };

  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };

  const client = getMessagingClient();
  const result = await client.send({ to: trimmedTo, channel, body: trimmedBody, tenantId });

  const { error } = await supabase.from("msg_message").insert({
    tenant_id: tenantId,
    channel,
    direction: "out",
    provider: client.provider,
    external_id: result.externalId ?? null,
    thread_key: `${channel}:${trimmedTo}`,
    from_addr: null,
    to_addr: trimmedTo,
    body: trimmedBody,
    media: [] as Database["public"]["Tables"]["msg_message"]["Insert"]["media"],
    status: result.status,
  });
  if (error) return { ok: false, message: "Could not record the message." };

  await logActivity(supabase, tenantId, {
    type: "message.sent",
    summary: `Outbound ${channel} message`,
    meta: { channel, status: result.status, provider: client.provider },
  });

  revalidatePath("/dashboard/messages");
  return {
    ok: result.status !== "failed",
    message:
      result.status === "failed"
        ? "Provider rejected the message — recorded as failed."
        : client.provider === "mock"
          ? "Recorded (mock provider — no message actually sent)."
          : "Message sent.",
  };
}
