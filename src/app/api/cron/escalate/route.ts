import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const ESCALATION_INTERVAL_DAYS = 7;

// State machine: awaiting_response → escalated_1 → escalated_2 → closed.
const NEXT_STATE: Record<string, string> = {
  awaiting_response: "escalated_1",
  escalated_1: "escalated_2",
  escalated_2: "closed",
};

function isoIn(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

// Notice escalation worker. Advances notices whose next_escalation_at has passed,
// logs an audit event, and queues an immediate notification. Idempotent per tick.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: dueNotices, error } = await supabase
    .from("notice")
    .select("id, tenant_id, type, escalation_state, next_escalation_at, matter_id")
    .in("escalation_state", ["awaiting_response", "escalated_1", "escalated_2"])
    .lte("next_escalation_at", nowIso)
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let escalated = 0;
  for (const n of dueNotices ?? []) {
    const next = NEXT_STATE[n.escalation_state];
    if (!next) continue;
    const nextAt = next === "closed" ? null : isoIn(ESCALATION_INTERVAL_DAYS);

    const { error: upErr } = await supabase
      .from("notice")
      .update({ escalation_state: next, next_escalation_at: nextAt })
      .eq("id", n.id)
      .eq("escalation_state", n.escalation_state); // idempotency guard
    if (upErr) continue;
    escalated++;

    await supabase.from("audit_event").insert({
      tenant_id: n.tenant_id,
      action: "notice.escalate",
      entity: "notice",
      entity_id: n.id,
      before: { state: n.escalation_state },
      after: { state: next },
    });

    // Queue an immediate notification (in-app + email).
    for (const channel of ["inapp", "email"] as const) {
      await supabase.from("notification").insert({
        tenant_id: n.tenant_id,
        channel,
        kind: "notice_escalation",
        payload: {
          ref: `notice:${n.id}`,
          title: n.type,
          body: `Notice "${n.type}" had no response and was escalated to ${next.replace("_", " ")}.`,
        },
        scheduled_for: nowIso,
        status: "pending",
      });
    }
  }

  return NextResponse.json({ ok: true, due: dueNotices?.length ?? 0, escalated });
}
