// WO-358 W1 — in-app delivery module extracted from cron/notify/route.ts.
// In-app: nothing to deliver; flipping status makes it visible in the bell.
// Per-channel try/catch isolation: an in-app flip error never blocks other channels.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import type { NotifyRow } from "@/lib/notify/pickup";

type AdminDB = SupabaseClient<Database>;

export type InAppDeliverResult = {
  sent: boolean;
  failed: boolean;
  /** retryPlan returned 'dead' — attempts exhausted. */
  dead: boolean;
};

export async function deliverInApp(
  supabase: AdminDB,
  row: NotifyRow,
  now: Date,
): Promise<InAppDeliverResult> {
  try {
    return await deliverInAppInner(supabase, row, now);
  } catch (e) {
    // WO-358 W1: per-channel isolation — an unexpected throw in in-app delivery
    // is caught. The row stays pending and will be retried next run.
    console.error(`[notify] in-app delivery threw for row ${row.id}: ${e instanceof Error ? e.message : String(e)}`);
    return { sent: false, failed: true, dead: false };
  }
}

async function deliverInAppInner(
  supabase: AdminDB,
  row: NotifyRow,
  now: Date,
): Promise<InAppDeliverResult> {
  let upErr: { message: string } | null = null;

  // Idempotency guard on every flip: only a still-queued row ('pending', or
  // 'failed' for the retry lane) can transition — a row already flipped 'sent'
  // can never be re-flipped, and the pickup queries above never select 'sent'/'dead'
  // rows, so one logical notification sends at most once successfully (WO-288 e).
  ({ error: upErr } = await supabase
    .from("notification")
    .update({ status: "sent", sent_at: now.toISOString() })
    .eq("id", row.id)
    .in("status", ["pending", "failed"]));

  if (upErr) {
    return { sent: false, failed: true, dead: false };
  }
  return { sent: true, failed: false, dead: false };
}
