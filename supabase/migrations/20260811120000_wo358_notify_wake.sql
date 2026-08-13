-- WO-358 W2 — event-driven notification wake-up (LISTEN/NOTIFY).
-- INERT until founder-applied. Nothing in the app reads or requires this: without the
-- trigger the listener simply never wakes and delivery falls back to the WO-355 5-min
-- cron, which is exactly the rollback posture. Rollback = drop the trigger + function.
set lock_timeout = '5s';  -- backend-verification §6: never convoy live traffic on DDL

-- The wake signal. Fired FROM THE INSERTING TRANSACTION, so it is delivered at COMMIT and
-- never before the row is visible — no "woke up and found nothing" race (this transactional
-- coupling is why LISTEN/NOTIFY was chosen over an external queue for W2).
--
-- Payload is the row id and NOTHING else. A NOTIFY payload is readable by every listener on
-- the channel and lands verbatim in psql/journald output: party names, emails and phone
-- numbers must never travel here. The listener re-reads the row through the normal
-- service-role pipeline, which is where PII handling already lives.
--
-- Not SECURITY DEFINER, and deliberately not EXECUTE-revoked: a function returning `trigger`
-- cannot be invoked directly ("trigger functions can only be called as trigger triggers") and
-- PostgREST does not expose it, so there is no callable surface to gate — while revoking
-- EXECUTE risks breaking CREATE TRIGGER re-runs for non-owner roles. search_path is pinned so
-- a rogue schema on someone's search_path can't shadow pg_notify.
--
-- Review finding F3, CORRECTED 2026-08-13 after an independent review caught the original
-- claim overclaiming (see the WO-358 file for the full round-2 record). What this guard
-- actually catches, and what it structurally cannot:
--
-- CATCHES: a SYNCHRONOUS pg_notify() failure — permission denied, a malformed channel/payload
-- argument, any error raised AT THE `perform pg_notify(...)` CALL SITE ITSELF, while this
-- function's exception scope is still on the stack. Proven live (throwaway local PG 16,
-- 2026-08-13): with EXECUTE on pg_notify(text,text) revoked from a test role — a real,
-- deterministic error at that exact line — the unguarded function aborted the INSERT (row
-- count unchanged); the guarded function (this one) caught it, logged a WARNING, and the row
-- landed.
--
-- DOES NOT CATCH — and structurally cannot — a full async NOTIFY queue (8GB, disk-backed).
-- Per Postgres's documented semantics, a queued notification is only written to the shared
-- queue (where the size limit is enforced) during PreCommit_Notify(), which runs as part of
-- COMMIT processing — AFTER this trigger function has already returned control to the INSERT
-- statement, which has itself already completed. There is no exception handler on the call
-- stack at that point; nothing inside notify_wake() can be. A full-queue failure surfaces as a
-- COMMIT-time error that rolls back the ENTIRE transaction, including the row this guard exists
-- to protect. Confirmed independently (2026-08-13, throwaway local PG 16) with a structural
-- analog — an identically-shaped begin/exception/end wrapping an insert that violates a
-- DEFERRABLE INITIALLY DEFERRED unique constraint (checked at commit, same as pg_notify's queue
-- write): the exception branch never ran (no NOTICE printed, confirmed by output), and COMMIT
-- rolled back the whole transaction including the row that fired the trigger.
--
-- So: F3 is PARTIALLY closed. The synchronous case above is fixed here and stays fixed. The
-- full-queue case named in the original finding is NOT fixed by this guard and remains open,
-- deferred to two things that are NOT in this migration: (1) the listener never silently
-- stopping — it holds a persistent LISTEN connection and is the only realistic drain path, so
-- keeping it alive (60s heartbeat + `Restart=always`, already in the WO-358 activation design)
-- is what stops the queue from approaching full in the first place; (2) a
-- `pg_notification_queue_usage()` dead-man/alarm as the leading detection signal — not yet
-- built, tracked under this WO's own W3 (delivery-latency + per-channel dead-man). Do not read
-- this guard as closing the full-queue hazard.
-- Non-blocking, stated rather than solved: the nested begin/exception opens an implicit
-- subtransaction per firing (per row on a bulk insert). Likely fine at this table's insert
-- volumes — unmeasured, no subxact-XID-assignment probe run against the happy path. Also:
-- WHEN OTHERS does not catch QUERY_CANCELED or ASSERT_FAILURE (standard PL/pgSQL behaviour,
-- not special-cased here).
create or replace function public.notify_wake()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  begin
    perform pg_notify('notify_wake', new.id::text);
  exception when others then
    raise warning 'notify_wake: pg_notify failed for notification %: % (%)', new.id, sqlerrm, sqlstate;
  end;
  return null;  -- AFTER trigger: the return value is ignored
end;
$$;

comment on function public.notify_wake() is
  'WO-358 W2: wakes the notify pipeline on a due-now notification insert. Payload = row id only (never PII). Catches a SYNCHRONOUS pg_notify failure (permission/config/bad-argument) and logs it instead of aborting the insert. Does NOT and cannot catch a full async queue: that failure surfaces at COMMIT, after this function has returned — mitigated by listener liveness (heartbeat + Restart=always), not by this guard. See the migration header comment.';

-- WHEN clause mirrors the pickup predicate in src/lib/notify/pickup.ts EXACTLY
-- (status = pending AND scheduled_for <= now; a NULL scheduled_for is never picked up
-- because PostgREST's .lte() excludes NULLs). Waking for a row the pipeline would not
-- pick up is a wasted run; a future-dated reminder is the cron's job, not the listener's.
drop trigger if exists notification_wake on public.notification;
create trigger notification_wake
  after insert on public.notification
  for each row
  when (
    new.status = 'pending'
    and new.scheduled_for is not null
    and new.scheduled_for <= now()
  )
  execute function public.notify_wake();
