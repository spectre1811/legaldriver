import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";

type DB = SupabaseClient<Database>;

// Append-only matter/tenant activity feed. Best-effort: never throws into the
// caller (a failed activity log must not break the underlying action).
export async function logActivity(
  sb: DB,
  tenantId: string,
  e: { matterId?: string | null; actorId?: string | null; type: string; summary: string; meta?: Record<string, unknown> },
): Promise<void> {
  try {
    await sb.from("activity_event").insert({
      tenant_id: tenantId,
      matter_id: e.matterId ?? null,
      actor_id: e.actorId ?? null,
      type: e.type,
      summary: e.summary,
      meta: (e.meta ?? {}) as Database["public"]["Tables"]["activity_event"]["Insert"]["meta"],
    });
  } catch {
    /* non-fatal */
  }
}
