// WO-358 W1 — notification-row pickup extracted from cron/notify/route.ts.
// Runs the two pickup queries (pending + retry) and returns a merged row set.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { MAX_SEND_ATTEMPTS } from "@/lib/notify/retry";

export type NotifyRow = {
  id: string;
  tenant_id: string;
  user_id: string | null;
  channel: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts?: number | null;
};

// WO-288 (e): second pickup — transiently-failed email rows come back for a
// bounded retry (attempts < MAX, due per their backoff). Fail-soft pre-migration:
// no `attempts` column ⇒ this select errors ⇒ empty lane (today's behavior). A
// NULL attempts (mid-migration shape) is excluded by the lt() filter — never
// crashes, never retries unbounded.
export async function pickupRows(
  supabase: SupabaseClient<Database>,
  nowIso: string,
): Promise<{ rows: NotifyRow[]; retryCount: number; error?: string }> {
  const { data: due, error: dueErr } = await supabase
    .from("notification")
    .select("id, tenant_id, user_id, channel, kind, payload")
    .eq("status", "pending")
    .lte("scheduled_for", nowIso)
    .limit(200);
  if (dueErr) return { rows: [], retryCount: 0, error: dueErr.message };

  const dueRows = (due ?? []) as NotifyRow[];

  let retryRows: NotifyRow[] = [];
  {
    const { data: retriable } = await supabase
      .from("notification")
      .select("id, tenant_id, user_id, channel, kind, payload, attempts")
      .eq("status", "failed")
      .eq("channel", "email")
      .lt("attempts", MAX_SEND_ATTEMPTS)
      .lte("scheduled_for", nowIso)
      .limit(100);
    retryRows = (retriable ?? []) as NotifyRow[];
  }

  return {
    rows: [...dueRows, ...retryRows],
    retryCount: retryRows.length,
  };
}
