import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import type { NormalizedCase } from "./types";

type DB = SupabaseClient<Database>;

// Resolve the caller's tenant via RLS (they can read only their own tenant row).
export async function getTenantId(supabase: DB): Promise<string | null> {
  const { data } = await supabase.from("tenant").select("id").single();
  return data?.id ?? null;
}

// Upsert a normalized case into matter + hearing for a tenant. Idempotent:
// re-running replaces the hearing set and refreshes matter fields + provenance.
// Returns the matter id. RLS enforces tenant isolation; we still set tenant_id.
export async function upsertCase(
  supabase: DB,
  tenantId: string,
  c: NormalizedCase,
  clientId?: string | null,
): Promise<{ matterId: string; isNew: boolean; hearingCount: number }> {
  // Does a matter with this CNR already exist for the tenant? Scope by tenant_id
  // explicitly so this is safe under the RLS-bypassing admin client (cron).
  const { data: existing } = await supabase
    .from("matter")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("cnr", c.cnr)
    .maybeSingle();

  const matterRow = {
    tenant_id: tenantId,
    client_id: clientId ?? null,
    cnr: c.cnr,
    title: c.title,
    court: c.court ?? null,
    case_type: c.caseType ?? null,
    parties: c.parties as unknown as Database["public"]["Tables"]["matter"]["Insert"]["parties"],
    stage: c.stage ?? null,
    status: c.status ?? "active",
    next_hearing_date: c.nextHearingDate ?? null,
    last_synced_at: c.fetchedAt,
    source: c.source,
  };

  let matterId: string;
  if (existing) {
    matterId = existing.id;
    await supabase.from("matter").update(matterRow).eq("id", matterId);
  } else {
    const { data, error } = await supabase
      .from("matter")
      .insert(matterRow)
      .select("id")
      .single();
    if (error || !data) throw new Error(`upsertCase: insert matter failed: ${error?.message}`);
    matterId = data.id;
  }

  // Replace hearings for the matter (idempotent re-sync).
  await supabase.from("hearing").delete().eq("matter_id", matterId);
  if (c.hearings.length) {
    const rows = c.hearings
      .filter((h) => h.date)
      .map((h) => ({
        tenant_id: tenantId,
        matter_id: matterId,
        date: h.date,
        purpose: h.purpose ?? null,
        court_no: h.courtNo ?? null,
        judge: h.judge ?? null,
        raw: (h.raw ?? {}) as Database["public"]["Tables"]["hearing"]["Insert"]["raw"],
      }));
    if (rows.length) await supabase.from("hearing").insert(rows);
  }

  return { matterId, isNew: !existing, hearingCount: c.hearings.length };
}
