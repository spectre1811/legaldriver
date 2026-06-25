import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import type { NormalizedCase } from "./types";
import { scheduleReminders } from "@/lib/notify/schedule";

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

  // Denormalized arrays power similar-case discovery (GIN-indexed) and console filters.
  const partyNames = [...new Set(c.parties.map((p) => p.name).filter(Boolean))];
  const advocateNames = [...new Set(c.parties.map((p) => p.advocate).filter((a): a is string => Boolean(a)))];
  const judgeNames = c.judges?.length ? c.judges : c.judge ? c.judge.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const actNames = c.acts ?? [];

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
    detail: (c.detail ?? null) as Database["public"]["Tables"]["matter"]["Insert"]["detail"],
    party_names: partyNames,
    advocate_names: advocateNames,
    judge_names: judgeNames,
    act_names: actNames,
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

  // Replace court orders for the matter (idempotent re-sync).
  await supabase.from("court_order").delete().eq("matter_id", matterId);
  if (c.orders?.length) {
    const orderRows = c.orders.map((o) => ({
      tenant_id: tenantId,
      matter_id: matterId,
      order_date: o.date && /^\d{4}-\d{2}-\d{2}/.test(o.date) ? o.date.slice(0, 10) : null,
      title: o.title ?? null,
    }));
    await supabase.from("court_order").insert(orderRows);
  }

  // Schedule reminders for the next hearing. Replace-on-change: clear pending
  // reminders for this matter, then (re)schedule for the current next date.
  const ref = `matter:${matterId}`;
  await supabase
    .from("notification")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("kind", "hearing_reminder")
    .eq("status", "pending")
    .contains("payload", { ref });
  if (c.nextHearingDate) {
    await scheduleReminders(supabase, tenantId, {
      kind: "hearing_reminder",
      eventDate: c.nextHearingDate,
      ref,
      title: c.title,
    });
  }

  return { matterId, isNew: !existing, hearingCount: c.hearings.length };
}
