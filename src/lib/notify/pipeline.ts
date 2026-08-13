// WO-358 W1 — notification pipeline orchestrator.
// Wires pickup → filter → compose → deliver → health into one run.
// Per-channel try/catch isolation ensures a throw in one channel
// never blocks delivery in another.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import type { Mailer } from "@/lib/notify/mailer";
import { pickupRows } from "@/lib/notify/pickup";
import { buildDeadRefFilter } from "@/lib/notify/filter/dead-refs";
import { buildCaseUpdateRoundup } from "@/lib/notify/compose/case-update";
import { deliverEmail } from "@/lib/notify/deliver/email";
import { deliverWhatsApp } from "@/lib/notify/deliver/whatsapp";
import { deliverInApp } from "@/lib/notify/deliver/inapp";
import { writeDeadManSignal } from "@/lib/notify/health";
import { messagingConfigured } from "@/lib/services/messaging/client";
import type { CaseUpdatePayload } from "@/lib/notify/email-render";
import type { CronLease } from "@/lib/cron/lock";

type AdminDB = SupabaseClient<Database>;

export type PipelineResult = {
  ok: boolean;
  channel: "email";
  whatsapp: "live" | "dark";
  considered: number;
  retried: number;
  sent: number;
  failed: number;
  dead: number;
  skipped: number;
  stale: number;
  deadRefs: number;
  roundups: number;
  /** WO-378: true ⇒ the run stopped early because it no longer held the cron lease. */
  fenced: boolean;
};

export async function runPipeline(
  supabase: AdminDB,
  mailer: Mailer,
  now = new Date(),
  lease?: CronLease,
): Promise<{ result: PipelineResult; error?: string }> {
  const nowIso = now.toISOString();

  // ── Pickup ──
  const { rows, retryCount, error: pickupErr } = await pickupRows(supabase, nowIso);
  if (pickupErr) return { result: zeroResult(mailer, 0, retryCount), error: pickupErr };

  if (rows.length === 0) {
    return { result: zeroResult(mailer, 0, retryCount) };
  }

  // ── Dead-ref filter ──
  const { filter: deadRefFilter, error: deadRefErr } = await buildDeadRefFilter(supabase, rows);
  if (deadRefErr) return { result: zeroResult(mailer, rows.length, retryCount), error: deadRefErr };

  // ── CaseUpdate roundup ──
  const caseUpdateGroup = buildCaseUpdateRoundup(rows, deadRefFilter.isDeadRef);
  const handled = new Set<string>();

  // ── Counters (mutable, aggregated from deliver results) ──
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let stale = 0;
  let deadRefs = 0;
  let roundups = 0;
  let dead = 0;
  // WO-288 (f): provider-outcome counters feed the email-sendpath dead-man row below.
  let emailAttempts = 0;
  let emailFailures = 0;
  let lastSendError: string | null = null;

  // ── Deliver loop ──
  let fenced = false;
  for (const row of rows) {
    if (handled.has(row.id)) continue; // delivered as part of a caseUpdate roundup

    // WO-378: lease fence. `try_acquire_cron_lock` STEALS an expired lease, so a run that
    // overran its TTL is racing its own successor over the same still-`pending` rows — and
    // sending happens BEFORE the status flip, so the flip guard stops a double flip, never a
    // double SEND. Checked before every row: a lost lease stops this run at the next row.
    if (lease && !(await lease.ok())) { fenced = true; break; }

    switch (row.channel) {
      case "whatsapp": {
        const r = await deliverWhatsApp(supabase, row, now);
        if (r.sent) sent++;
        else if (r.failed) failed++;
        else if (r.skipped) skipped++;
        continue;
      }

      case "email": {
        const deps = {
          isDeadRef: deadRefFilter.isDeadRef,
          flipTerminal: deadRefFilter.flipTerminal,
          caseUpdateGroup,
          handled,
          now,
        };
        const r = await deliverEmail(supabase, mailer, row, deps);
        if (r.sent) sent++;
        else if (r.failed) failed++;
        if (r.deadRefs) deadRefs++;
        if (r.stale) stale++;
        if (r.siblings > 0) { sent += r.siblings; roundups++; }
        if (r.attempt) emailAttempts++;
        if (r.attemptFailed) emailFailures++;
        if (r.dead) dead++;
        if (r.lastSendError) lastSendError = r.lastSendError;
        continue;
      }

      default: {
        // in-app + any future channel: flip to sent directly
        const r = await deliverInApp(supabase, row, now);
        if (r.sent) sent++;
        else if (r.failed) failed++;
        if (r.dead) dead++;
        continue;
      }
    }
  }

  // ── Dead-man signal ──
  await writeDeadManSignal(supabase, emailAttempts, emailFailures, lastSendError, now);

  const whatsapp: "live" | "dark" = messagingConfigured() ? "live" : "dark";
  return {
    result: {
      ok: true,
      channel: mailer.channel,
      whatsapp,
      considered: rows.length,
      retried: retryCount,
      sent, failed, dead, skipped, stale, deadRefs, roundups, fenced,
    },
  };
}

function zeroResult(mailer: Mailer, considered: number, retried: number): PipelineResult {
  return {
    ok: true,
    channel: mailer.channel,
    whatsapp: messagingConfigured() ? "live" : "dark",
    considered,
    retried,
    sent: 0, failed: 0, dead: 0, skipped: 0, stale: 0, deadRefs: 0, roundups: 0, fenced: false,
  };
}
