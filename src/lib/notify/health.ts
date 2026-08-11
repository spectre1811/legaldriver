// WO-358 W1 — dead-man health signal extracted from cron/notify/route.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";

type AdminDB = SupabaseClient<Database>;

// WO-288 (f): dead-man signal on the existing court_provider_health surface
// (settings diagnostics reads it) — every-attempted-send-failed is exactly the
// outage shape (2026-07-26: 403 on 100% of sends). Best-effort, like the
// deploy-freshness row. W2 wires a real GChat/SNS alarm; no webhook URL exists
// in-repo for the Vercel runtime to call, so this surface is the honest interim.
export async function writeDeadManSignal(
  supabase: AdminDB,
  emailAttempts: number,
  emailFailures: number,
  lastSendError: string | null,
  now: Date,
): Promise<void> {
  if (emailAttempts <= 0) return;

  try {
    await supabase.from("court_provider_health").upsert(
      {
        provider: "email-sendpath",
        ok: emailFailures < emailAttempts,
        last_error: emailFailures === emailAttempts ? (lastSendError ?? "all sends failed").slice(0, 200) : null,
        ...(emailFailures < emailAttempts ? { last_ok_at: now.toISOString() } : {}),
        updated_at: now.toISOString(),
      },
      { onConflict: "provider" },
    );
  } catch {
    /* the response counters below still tell the story */
  }
}
