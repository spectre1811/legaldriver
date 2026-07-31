import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import type { NormalizedCase } from "./types";
import { scheduleReminders } from "@/lib/notify/schedule";
import { normalizeTier } from "./tier";
import { maskTitle } from "./mask";
import { istFriendlyDate } from "@/lib/notify/email-render";

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
  // Exclude masked ("XXXXXXX") protected-matter names — they must never be a fuzzy client-match /
  // similar-case key, else every protected case matches every other (BP-24).
  const partyNames = [...new Set(c.parties.filter((p) => !p.masked).map((p) => p.name).filter(Boolean))];
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
    // WO-54 W1: promote the court tier to an indexed, NORMALIZED column (raw `detail.tier` is
    // un-normalized) so the Cases tier tabs/facets query an index, not a jsonb full-scan. Additive +
    // nullable → a null (unknown/manual case) never breaks the sync.
    tier: normalizeTier((c.detail as Record<string, unknown> | null)?.tier),
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
    if (rows.length) {
      // WO-156: never swallow the write — a rejected hearing insert must surface, not vanish.
      const { error: hearingErr } = await supabase.from("hearing").insert(rows);
      if (hearingErr) throw new Error(`upsertCase: hearing insert failed: ${hearingErr.message}`);
    }
  }

  // Replace court orders for the matter (idempotent re-sync).
  await supabase.from("court_order").delete().eq("matter_id", matterId);
  if (c.orders?.length) {
    // WO-156: dedupe by the STABLE provider order id — the identity of an order. Multiple
    // orders can legitimately be dateless with a generic "Order" title, so keying on
    // (date, title) collapses distinct orders and (under the old court_order_dedup_idx unique
    // index) made the whole multi-row insert fail atomically → 0 orders persisted silently.
    const seenOrderId = new Set<string>();
    const orderRows = c.orders
      .filter((o) => o.id && !seenOrderId.has(o.id) && seenOrderId.add(o.id))
      .map((o) => ({
        tenant_id: tenantId,
        matter_id: matterId,
        order_date: o.date && /^\d{4}-\d{2}-\d{2}/.test(o.date) ? o.date.slice(0, 10) : null,
        title: o.title ?? null,
        // Do NOT persist the provider's presigned pdf_url — it expires (~1h) → AccessDenied.
        // Store only the stable provider order id; the PDF is streamed on demand via
        // /api/court/order-pdf → the provider's stable /order/{id}/pdf endpoint.
        raw: { order_id: o.id, has_pdf: !!o.pdfUrl } as Database["public"]["Tables"]["court_order"]["Insert"]["raw"],
      }));
    if (orderRows.length) {
      // WO-156: surface a failed order write instead of swallowing it (the exact bug that
      // wiped orders on every refresh while the action still reported success).
      const { error: orderErr } = await supabase.from("court_order").insert(orderRows);
      if (orderErr) throw new Error(`upsertCase: court_order insert failed: ${orderErr.message}`);
    }
  }

  // WO-314: hoisted so both the reminder scheduler AND change-detection alert can bind the
  // same next-hearing row (purpose/court no.) and the most recent order — the founder's "shows
  // nothing about the case" complaint, fixed at the one place both alert paths read from.
  const nextHearing = c.nextHearingDate ? c.hearings.find((h) => h.date === c.nextHearingDate) : undefined;
  const latestOrder = [...(c.orders ?? [])].filter((o) => o.date).sort((a, b) => (a.date! < b.date! ? 1 : -1))[0];
  // Registration number lives inside `detail` jsonb (no `case_number` column on `matter`) — the
  // SAME key the case-detail page reads (case-detail-fields.ts extractCaseDetailValues).
  const caseDetail = (c.detail ?? {}) as Record<string, unknown>;
  const regNo = typeof caseDetail.registrationNumber === "string" && caseDetail.registrationNumber.trim()
    ? caseDetail.registrationNumber.trim()
    : undefined;

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
    // WO-264: pass case context so the hearingReminder email binds court/CNR + a real CTA;
    // purpose comes from the hearing row for the next date when the record carries it.
    // WO-314: + court number + stage — BP-24 masked titles never ride into an email raw.
    await scheduleReminders(supabase, tenantId, {
      kind: "hearing_reminder",
      eventDate: c.nextHearingDate,
      ref,
      title: maskTitle(c.title),
      extra: {
        cnr: c.cnr,
        matterId,
        ...(c.court ? { court: c.court } : {}),
        ...(nextHearing?.purpose ? { purpose: nextHearing.purpose } : {}),
        ...(nextHearing?.courtNo ? { courtNo: nextHearing.courtNo } : {}),
        ...(c.stage ? { stage: c.stage } : {}),
      },
    });
  }

  // Change detection (only for an already-tracked case): if the next hearing moved,
  // the bench changed, or new orders posted, record an activity + an in-app alert.
  if (existing) {
    await recordCaseChanges(supabase, tenantId, matterId, {
      title: c.title,
      cnr: c.cnr,
      court: c.court ?? null,
      oldNext: existing.next_hearing_date ?? null,
      newNext: c.nextHearingDate ?? null,
      oldJudge: (existing.judge_names ?? [])[0] ?? null,
      newJudge: judgeNames[0] ?? null,
      oldOrderDates,
      newOrderDates: (c.orders ?? []).map((o) => o.date).filter((d): d is string => !!d),
      // WO-314: the founder's screenshot was a bench-change alert saying nothing about the case.
      stage: c.stage ?? null,
      purpose: nextHearing?.purpose ?? null,
      coram: judgeNames.length ? judgeNames.join(", ") : null,
      regNo: regNo ?? null,
      latestOrder: latestOrder?.date ? { title: latestOrder.title ?? null, date: latestOrder.date } : null,
    });
  }

  return { matterId, isNew: !existing, hearingCount: c.hearings.length };
}

// Diff a refreshed case against its prior state and record any material changes as
// an activity_event (case feed) + an immediate in-app notification (the bell) + a
// caseUpdate email row (WO-264 — rendered by the notify cron through the v2 template,
// with same-day changes across matters rolled into one email per tenant). This is the
// "we watch the court so you never miss a re-listing" alerting.
async function recordCaseChanges(
  supabase: DB,
  tenantId: string,
  matterId: string,
  s: {
    title: string; cnr: string; court: string | null; oldNext: string | null; newNext: string | null;
    oldJudge: string | null; newJudge: string | null; oldOrderDates: string[]; newOrderDates: string[];
    // WO-314: the email producer widening — everything the enriched caseUpdate template needs
    // that a simple before/after diff doesn't otherwise carry.
    stage: string | null; purpose: string | null; coram: string | null; regNo: string | null;
    latestOrder: { title: string | null; date: string } | null;
  },
): Promise<void> {
  const changes: string[] = [];
  // The closed-set `change` label leads the email subject ("{change}" ≤4 words so the
  // ≤6-word cap holds — WO-148 W2 rework rule). Priority: orders > next date > bench.
  let change: string | null = null;
  if (s.newNext && s.oldNext !== s.newNext) {
    changes.push(`Next hearing ${s.oldNext ? `moved from ${s.oldNext} to ${s.newNext}` : `listed for ${s.newNext}`}`);
    change = s.oldNext ? "Next hearing changed" : "Next hearing set";
  }
  if (!s.newNext && s.oldNext) {
    changes.push(`Case shows no next date (possibly disposed) — was ${s.oldNext}`);
    change = change ?? "No next date on record";
  }
  if (s.newJudge && s.oldJudge && s.newJudge !== s.oldJudge) {
    changes.push(`Bench changed to ${s.newJudge}`);
    change = change ?? "Bench changed";
  }
  const oldSet = new Set(s.oldOrderDates);
  const newOrders = [...new Set(s.newOrderDates)].filter((d) => !oldSet.has(d));
  if (newOrders.length && s.oldOrderDates.length) {
    changes.push(`${newOrders.length} new order${newOrders.length > 1 ? "s" : ""} (latest ${newOrders.sort().reverse()[0]})`);
    change = newOrders.length > 1 ? "New orders" : "New order"; // orders outrank other labels
  }
  if (!changes.length) return;

  try {
    for (const ch of changes) {
      await supabase.from("activity_event").insert({
        tenant_id: tenantId, matter_id: matterId, type: "case.updated", summary: ch,
        meta: {} as Database["public"]["Tables"]["activity_event"]["Insert"]["meta"],
      });
    }
    // One consolidated alert per refresh: the bell (in-app) + the caseUpdate email row
    // (WO-264). Same payload; the email adds the closed-set label + case ref for the template.
    // WO-314: title is masked here (BP-24) — this payload feeds the email renderer directly,
    // not a component that masks at render time, so an unmasked title would leak a protected
    // party's name verbatim into the inbox.
    const payload = { ref: `matter:${matterId}`, title: maskTitle(s.title), body: changes.join(" · "), eventDate: s.newNext ?? undefined };
    await supabase.from("notification").insert([
      {
        tenant_id: tenantId, channel: "inapp", kind: "case_update", status: "pending",
        scheduled_for: new Date().toISOString(),
        payload: payload as Database["public"]["Tables"]["notification"]["Insert"]["payload"],
      },
      {
        tenant_id: tenantId, channel: "email", kind: "case_update", status: "pending",
        scheduled_for: new Date().toISOString(),
        payload: {
          ...payload,
          change: change ?? "Case update",
          cnr: s.cnr,
          matterId,
          ...(s.court ? { court: s.court } : {}),
          ...(s.stage ? { stage: s.stage } : {}),
          ...(s.purpose ? { purpose: s.purpose } : {}),
          ...(s.coram ? { coram: s.coram } : {}),
          ...(s.regNo ? { regNo: s.regNo } : {}),
          ...(s.latestOrder ? { orderTitle: s.latestOrder.title ?? "Order", orderDate: istFriendlyDate(s.latestOrder.date) } : {}),
        } as Database["public"]["Tables"]["notification"]["Insert"]["payload"],
      },
    ]);
  } catch { /* alerting is best-effort — never break a sync */ }
}
