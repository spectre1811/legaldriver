// WO-358 W1 — dead-ref filter extracted from cron/notify/route.ts.
// Verifies matter-linked email rows against the live matter table in one batch.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { matterIdOf } from "@/lib/notify/email-render";
import type { NotifyRow } from "@/lib/notify/pickup";

export type DeadRefFilter = {
  isDeadRef: (payload: Record<string, unknown>) => boolean;
  flipTerminal: (id: string) => Promise<void>;
};

// WO-264 defect fix (2026-07-22, founder-hit live): notification rows can OUTLIVE
// their matter — something hard-deletes matters without an audit trail (INBOX:
// data-lifecycle investigation), and a reminder sent afterwards deep-links to a 404.
// Verify every matter-linked email row against the live table in ONE batch; dead
// refs flip failed and never send. 290/1846 pending rows were dead on discovery day.
export async function buildDeadRefFilter(
  supabase: SupabaseClient<Database>,
  rows: NotifyRow[],
): Promise<{ filter: DeadRefFilter; error?: string }> {
  const refIds = [
    ...new Set(
      rows
        .filter((n) => n.channel === "email")
        .map((n) => matterIdOf(n.payload))
        .filter((id): id is string => !!id),
    ),
  ];
  const liveMatters = new Set<string>();
  if (refIds.length) {
    // Fail CLOSED-for-the-run, open-for-the-rows: a failed existence read must abort
    // (rows stay pending, retried next run) — an empty liveMatters set would otherwise
    // mass-flip every matter-linked row to failed on a transient DB error (review
    // finding, PR#194; this stack had an all-reads outage on 2026-07-20).
    const { data: live, error: liveErr } = await supabase
      .from("matter")
      .select("id")
      .in("id", refIds)
      .is("deleted_at", null);
    if (liveErr) return { filter: { isDeadRef: () => false, flipTerminal: async () => {} }, error: `matter existence check failed: ${liveErr.message}` };
    for (const m of live ?? []) liveMatters.add(m.id);
  }

  const isDeadRef = (payload: Record<string, unknown>) => {
    const id = matterIdOf(payload);
    return !!id && !liveMatters.has(id);
  };

  // WO-288: a row leaves the queue for good — undeliverable-by-definition (dead
  // matter ref, stale reminder) or retries exhausted. Fail-soft pre-migration:
  // 'dead' violates the old status check ⇒ fall back to today's 'failed' flip.
  const flipTerminal = async (id: string) => {
    const { error: deadErr } = await supabase
      .from("notification")
      .update({ status: "dead", sent_at: null })
      .eq("id", id)
      .in("status", ["pending", "failed"]);
    if (deadErr)
      await supabase.from("notification").update({ status: "failed", sent_at: null }).eq("id", id).eq("status", "pending");
  };

  return { filter: { isDeadRef, flipTerminal } };
}
