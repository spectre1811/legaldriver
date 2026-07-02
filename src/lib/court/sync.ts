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
    .select("id, next_hearing_date, judge_names")
    .eq("tenant_id", tenantId)
    .eq("cnr", c.cnr)
    .maybeSingle();

  // Snapshot the old order dates (before we replace them) so a refresh can detect
  // NEW orders and fire a change alert — the "never get surprised" case-tracking value.
  let oldOrderDates: string[] = [];
  if (existing) {
    const { data: oldOrders } = await supabase.from("court_order").select("order_date").eq("matter_id", existing.id);
    oldOrderDates = (oldOrders ?? []).map((o) => o.order_date).filter((d): d is string => !!d);
  }

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
      // Do NOT persist the provider's presigned pdf_url — it expires (~1h) → AccessDenied.
      // Store only the stable provider order id; the PDF is streamed on demand via
      // /api/court/order-pdf → the provider's stable /order/{id}/pdf endpoint.
      raw: { order_id: o.id, has_pdf: !!o.pdfUrl } as Database["public"]["Tables"]["court_order"]["Insert"]["raw"],
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

  // Change detection (only for an already-tracked case): if the next hearing moved,
  // the bench changed, or new orders posted, record an activity + an in-app alert.
  if (existing) {
    await recordCaseChanges(supabase, tenantId, matterId, {
      title: c.title,
      oldNext: existing.next_hearing_date ?? null,
      newNext: c.nextHearingDate ?? null,
      oldJudge: (existing.judge_names ?? [])[0] ?? null,
      newJudge: judgeNames[0] ?? null,
      oldOrderDates,
      newOrderDates: (c.orders ?? []).map((o) => o.date).filter((d): d is string => !!d),
    });
  }

  return { matterId, isNew: !existing, hearingCount: c.hearings.length };
}

// Diff a refreshed case against its prior state and record any material changes as
// an activity_event (case feed) + an immediate in-app notification (the bell). This
// is the "we watch the court so you never miss a re-listing" alerting.
async function recordCaseChanges(
  supabase: DB,
  tenantId: string,
  matterId: string,
  s: { title: string; oldNext: string | null; newNext: string | null; oldJudge: string | null; newJudge: string | null; oldOrderDates: string[]; newOrderDates: string[] },
): Promise<void> {
  const changes: string[] = [];
  if (s.newNext && s.oldNext !== s.newNext) changes.push(`Next hearing ${s.oldNext ? `moved from ${s.oldNext} to ${s.newNext}` : `listed for ${s.newNext}`}`);
  if (!s.newNext && s.oldNext) changes.push(`Case shows no next date (possibly disposed) — was ${s.oldNext}`);
  if (s.newJudge && s.oldJudge && s.newJudge !== s.oldJudge) changes.push(`Bench changed to ${s.newJudge}`);
  const oldSet = new Set(s.oldOrderDates);
  const newOrders = [...new Set(s.newOrderDates)].filter((d) => !oldSet.has(d));
  if (newOrders.length && s.oldOrderDates.length) changes.push(`${newOrders.length} new order${newOrders.length > 1 ? "s" : ""} (latest ${newOrders.sort().reverse()[0]})`);
  if (!changes.length) return;

  try {
    for (const ch of changes) {
      await supabase.from("activity_event").insert({
        tenant_id: tenantId, matter_id: matterId, type: "case.updated", summary: ch,
        meta: {} as Database["public"]["Tables"]["activity_event"]["Insert"]["meta"],
      });
    }
    // One consolidated in-app alert per refresh (delivered immediately by the notify cron).
    await supabase.from("notification").insert({
      tenant_id: tenantId, channel: "inapp", kind: "case_update", status: "pending",
      scheduled_for: new Date().toISOString(),
      payload: { ref: `matter:${matterId}`, title: s.title, body: changes.join(" · "), eventDate: s.newNext ?? undefined } as Database["public"]["Tables"]["notification"]["Insert"]["payload"],
    });
  } catch { /* alerting is best-effort — never break a sync */ }
}
