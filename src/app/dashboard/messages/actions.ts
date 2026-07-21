"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";
import { getMessagingClient } from "@/lib/services/messaging/client";
import { canSendWhatsApp } from "@/lib/services/messaging/consent";
import { normalizeE164 } from "@/lib/phone";
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
  const normalizedTo = normalizeE164(to);
  const trimmedBody = body.trim();
  if (!normalizedTo) return { ok: false, message: "Enter a valid phone number, e.g. +91XXXXXXXXXX." };
  if (!trimmedBody) return { ok: false, message: "Message body is empty." };

  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };

  // WO-144 W2: consent gate — fail closed. No open 'service' grant in the
  // consent ledger for this number ⇒ no send, ever.
  if (!(await canSendWhatsApp(supabase, normalizedTo))) {
    return { ok: false, message: "No WhatsApp consent on record for this number. The recipient must opt in first — sends stay blocked until they do." };
  }

  const client = getMessagingClient();
  const result = await client.send({ to: normalizedTo, channel, body: trimmedBody, tenantId });

  const { error } = await supabase.from("msg_message").insert({
    tenant_id: tenantId,
    channel,
    direction: "out",
    provider: client.provider,
    external_id: result.externalId ?? null,
    thread_key: `${channel}:${normalizedTo}`,
    from_addr: null,
    to_addr: normalizedTo,
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
