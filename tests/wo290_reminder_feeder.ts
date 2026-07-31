// Test: hearing_reminder feeder close (WO-290 W2), offline. No live services.
// Run: npx tsx tests/wo290_reminder_feeder.ts
//
// Root cause (INBOX 2026-07-29 + WO-288 O2 one-shot): a stale court record can hand
// sync a nextHearingDate whose hearing already happened (record never refreshed) —
// scheduleReminders enqueued a reminder for it anyway, the notify cron picked up the
// past scheduled_for, hearingWhenLabel() returned null (stale), and the row died.
// 192 such rows were flipped failed→dead as a one-shot mop; this proves the ACCRUAL
// is closed: scheduleReminders now rejects a past EVENT date outright (guards on the
// event date directly, not the derived per-offset scheduled_for), so zero new
// hearing_reminder rows get queued for an already-past hearing.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { scheduleReminders } from "@/lib/notify/schedule";
import { istDate } from "@/lib/notify/email-render";

type DB = SupabaseClient<Database>;

let ok = true;
const check = (name: string, cond: boolean) => {
  if (!cond) ok = false;
  console.log(`${cond ? "ok  " : "FAIL"}: ${name}`);
};

// Fixed instant: 2026-07-20T05:00:00Z = 2026-07-20 10:30 IST — safely inside the IST
// calendar day AND before the day-of send window (09:00Z/2:30pm IST), so "today"'s
// offset-0 reminder is still legitimately schedulable. Deterministic regardless of
// when this test actually runs (scheduleReminders takes an injectable `now`, same
// pattern as istDate()/hearingWhenLabel()).
const NOW = new Date("2026-07-20T05:00:00Z");

function fakeDb(inserted: unknown[][]): { db: DB; fromCalls: () => number } {
  let fromCalls = 0;
  const chain = { eq: () => chain, contains: () => Promise.resolve({ data: [], error: null }) };
  const db = {
    from: () => {
      fromCalls++;
      return {
        select: () => chain,
        insert: (rows: unknown[]) => {
          inserted.push(rows);
          return Promise.resolve({ error: null });
        },
      };
    },
  } as unknown as DB;
  return { db, fromCalls: () => fromCalls };
}

async function main() {
  // --- PAST nextHearingDate: a stale record whose hearing already happened ---
  {
    const inserted: unknown[][] = [];
    const { db, fromCalls } = fakeDb(inserted);
    const n = await scheduleReminders(
      db,
      "t1",
      { kind: "hearing_reminder", eventDate: istDate(-1, NOW), ref: "matter:m1", title: "A v. B", channels: ["email"] },
      NOW,
    );
    check("past eventDate: scheduleReminders returns 0", n === 0);
    check("past eventDate: zero hearing_reminder rows inserted", inserted.length === 0);
    check("past eventDate: short-circuits before any DB read (no wasted query)", fromCalls() === 0);
  }

  // --- TODAY (IST) nextHearingDate: still legitimate, day-of reminder enqueues ---
  {
    const inserted: unknown[][] = [];
    const { db } = fakeDb(inserted);
    const n = await scheduleReminders(
      db,
      "t1",
      { kind: "hearing_reminder", eventDate: istDate(0, NOW), ref: "matter:m2", title: "C v. D", channels: ["email"] },
      NOW,
    );
    check("today (IST) eventDate: scheduleReminders enqueues exactly one (day-of)", n === 1);
    check("today (IST) eventDate: exactly one row inserted", inserted.length === 1 && (inserted[0] as unknown[]).length === 1);
  }

  // --- FUTURE nextHearingDate: unaffected, all 3 offsets (T-3/T-1/day-of) enqueue ---
  {
    const inserted: unknown[][] = [];
    const { db } = fakeDb(inserted);
    const n = await scheduleReminders(
      db,
      "t1",
      { kind: "hearing_reminder", eventDate: istDate(5, NOW), ref: "matter:m3", title: "E v. F", channels: ["email"] },
      NOW,
    );
    check("future eventDate: scheduleReminders enqueues all 3 offsets", n === 3);
  }

  // --- non-hearing caller (deadline_reminder) gets the same guard — fixed once, shared ---
  {
    const inserted: unknown[][] = [];
    const { db } = fakeDb(inserted);
    const n = await scheduleReminders(
      db,
      "t1",
      { kind: "deadline_reminder", eventDate: istDate(-3, NOW), ref: "deadline:d1", title: "reply due", channels: ["email"] },
      NOW,
    );
    check("past deadline_reminder eventDate: also guarded (shared fix, all callers)", n === 0 && inserted.length === 0);
  }

  console.log(ok ? "WO290 REMINDER FEEDER: PASS" : "WO290 REMINDER FEEDER: FAIL");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
