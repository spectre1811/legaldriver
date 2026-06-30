import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";

type DB = SupabaseClient<Database>;

// Record an outbound email so it shows in the Communications timeline (two-way).
// No PII beyond subject + recipient. Best-effort: never throws into the send path.
export async function logOutboundEmail(
  sb: DB,
  opts: { tenantId: string; to: string; subject?: string | null; kind?: string; matterId?: string | null; clientId?: string | null; ok: boolean; providerId?: string | null },
): Promise<void> {
  try {
    await sb.from("outbound_email").insert({
      tenant_id: opts.tenantId, to_addr: opts.to, subject: opts.subject ?? null, kind: opts.kind ?? "other",
      matter_id: opts.matterId ?? null, client_id: opts.clientId ?? null,
      status: opts.ok ? "sent" : "failed", provider_id: opts.providerId ?? null,
    });
  } catch { /* logging is best-effort */ }
}
