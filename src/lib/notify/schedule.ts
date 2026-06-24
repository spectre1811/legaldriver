import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";

type DB = SupabaseClient<Database>;

// Reminder lead times (days before the event). Tenant-configurable later; defaults here.
export const REMINDER_OFFSETS = [3, 1, 0];

function atNineLocal(dateISO: string, offsetDays: number): Date {
  // Fire at 09:00 UTC, `offsetDays` before the event date.
  const d = new Date(`${dateISO}T09:00:00Z`);
  d.setUTCDate(d.getUTCDate() - offsetDays);
  return d;
}

// Schedule T-3/T-1/day-of reminders for one dated event (hearing/deadline).
// Idempotent: a (tenant, ref, scheduled_for, channel) tuple is inserted at most
// once, and past send-times are skipped. `ref` ties reminders to their source row.
export async function scheduleReminders(
  supabase: DB,
  tenantId: string,
  opts: {
    userId?: string | null;
    kind: string; // "hearing_reminder" | "deadline_reminder"
    eventDate: string; // ISO date
    ref: string; // e.g. "hearing:<id>"
    title: string;
    channels?: ("inapp" | "email")[];
  },
): Promise<number> {
  const channels = opts.channels ?? ["inapp", "email"];
  const now = Date.now();

  // What's already scheduled for this ref?
  const { data: existing } = await supabase
    .from("notification")
    .select("scheduled_for, channel")
    .eq("tenant_id", tenantId)
    .eq("kind", opts.kind)
    .contains("payload", { ref: opts.ref });
  const seen = new Set((existing ?? []).map((e) => `${e.channel}@${e.scheduled_for}`));

  const rows: Database["public"]["Tables"]["notification"]["Insert"][] = [];
  for (const offset of REMINDER_OFFSETS) {
    const when = atNineLocal(opts.eventDate, offset);
    if (when.getTime() < now) continue; // don't schedule reminders in the past
    const scheduledFor = when.toISOString();
    for (const channel of channels) {
      if (seen.has(`${channel}@${scheduledFor}`)) continue;
      rows.push({
        tenant_id: tenantId,
        user_id: opts.userId ?? null,
        channel,
        kind: opts.kind,
        payload: {
          ref: opts.ref,
          title: opts.title,
          eventDate: opts.eventDate,
          offsetDays: offset,
        },
        scheduled_for: scheduledFor,
        status: "pending",
      });
    }
  }
  if (rows.length) await supabase.from("notification").insert(rows);
  return rows.length;
}
