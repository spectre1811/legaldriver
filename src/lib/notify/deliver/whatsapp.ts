// WO-358 W1 — WhatsApp delivery module extracted from cron/notify/route.ts.
// Per-channel try/catch isolation: a WhatsApp throw never blocks email or in-app.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { normalizeE164 } from "@/lib/phone";
import { messagingConfigured, getMessagingClient } from "@/lib/services/messaging/client";
import { canSendWhatsApp } from "@/lib/services/messaging/consent";
import { subjectForKind } from "@/lib/notify/compose/fallback";
import type { NotifyRow } from "@/lib/notify/pickup";

type AdminDB = SupabaseClient<Database>;

export type WhatsAppDeliverResult = {
  sent: boolean;
  failed: boolean;
  skipped: boolean;
};

// WhatsApp (WO-144 W1): delivered through the real messaging gateway. Skip — NOT fail — while
// unconfigured (no BSP) or on an unparseable number, so the row stays pending and delivers the
// moment a provider is live; no churn to a permanent 'failed'.
export async function deliverWhatsApp(
  supabase: AdminDB,
  row: NotifyRow,
  now: Date,
): Promise<WhatsAppDeliverResult> {
  try {
    return await deliverWhatsAppInner(supabase, row, now);
  } catch (e) {
    // WO-358 W1: per-channel isolation — an unexpected throw in WhatsApp delivery
    // is caught. The row stays pending and will be retried next run.
    console.error(`[notify] WhatsApp delivery threw for row ${row.id}: ${e instanceof Error ? e.message : String(e)}`);
    return { sent: false, failed: true, skipped: false };
  }
}

async function deliverWhatsAppInner(
  supabase: AdminDB,
  row: NotifyRow,
  now: Date,
): Promise<WhatsAppDeliverResult> {
  const payload = row.payload as Record<string, unknown>;
  const to = normalizeE164(payload.phone as string | undefined);

  if (!messagingConfigured() || !to) {
    return { sent: false, failed: false, skipped: true };
  }

  // WO-144 W2: no open consent ⇒ skip, row stays pending — delivers only once consent exists (skip-not-fail per W1).
  if (!(await canSendWhatsApp(supabase, to))) {
    return { sent: false, failed: false, skipped: true };
  }

  const body = (payload.body ?? subjectForKind(row.kind, payload as { title?: string; eventDate?: string; count?: number })) as string;
  const client = getMessagingClient();
  const res = await client.send({ to, channel: "whatsapp", body, tenantId: row.tenant_id });

  const ok = res.status !== "failed";
  const { error: waErr } = await supabase
    .from("notification")
    .update({ status: ok ? "sent" : "failed", sent_at: ok ? now.toISOString() : null })
    .eq("id", row.id)
    .eq("status", "pending");

  if (waErr || !ok) return { sent: false, failed: true, skipped: false };
  return { sent: true, failed: false, skipped: false };
}
