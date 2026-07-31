import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { istDate } from "@/lib/notify/email-render";

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
// A past EVENT date (WO-290 W2, see guard below) is rejected outright — never
// even queried against `existing`.
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
    // WO-264: case context so the email template binds an honest court/CNR ref line
    // and a working CTA (caseDetailHref). Optional — legacy callers still work.
    extra?: { cnr?: string; court?: string; matterId?: string; purpose?: string };
  },
  now: Date = new Date(), // injectable for deterministic IST-boundary tests, same pattern as istDate()/hearingWhenLabel()
): Promise<number> {
  // WO-290 W2: a stale court record can still hand sync an eventDate whose hearing
  // already happened (the hearing passed but the source record wasn't refreshed) —
  // never enqueue a reminder for it. This is the daily hearing_reminder "dead row"
  // feeder (WO-290): a scheduled_for in the past gets picked up by the notify cron,
  // fails (hearingWhenLabel returns null for a past hearing), and dies. Guard on the
  // EVENT date directly rather than relying on the per-offset scheduled_for check
  // below. "Today" is IST (product's tz for all today/tomorrow logic — WO-256/257);
  // reuse istDate() instead of reimplementing IST day math. The broader IST day-of
  // scheduling-geometry (offset boundary correctness) is WO-257's scope — this is
  // only the contained enqueue guard that closes the feeder.
  if (opts.eventDate.slice(0, 10) < istDate(0, now)) return 0;

  const channels = opts.channels ?? ["inapp", "email"];
  const nowMs = now.getTime();

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
    if (when.getTime() < nowMs) continue; // don't schedule reminders in the past
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
          ...(opts.extra ?? {}),
        },
        scheduled_for: scheduledFor,
        status: "pending",
      });
    }
  }
  if (rows.length) await supabase.from("notification").insert(rows);
  return rows.length;
}
