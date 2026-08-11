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
create or replace function public.notify_wake()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  perform pg_notify('notify_wake', new.id::text);
  return null;  -- AFTER trigger: the return value is ignored
end;
$$;

comment on function public.notify_wake() is
  'WO-358 W2: wakes the notify pipeline on a due-now notification insert. Payload = row id only (never PII).';

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
