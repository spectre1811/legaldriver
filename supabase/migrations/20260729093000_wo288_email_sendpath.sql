-- WO-288 · Email send-path hardening (W1). INERT on merge — founder applies.
-- Runtime code is fail-soft against the pre-apply schema (falls back to the
-- legacy row shapes), so merge order is safe either way.

-- 1) outbound_email: capture the provider error verbatim (the 2026-07-26 403s
--    left no trace), and allow system sends that have no tenant (the
--    request-access founder notify, credentials emails). RLS posture UNCHANGED:
--    the existing tenant policies stay exactly as-is — a NULL-tenant row matches
--    no `tenant_id = current_tenant_id()` policy (NULL comparison ⇒ not true), so
--    only the service role can read or write such rows. Deny-by-default preserved,
--    nothing loosened.
alter table outbound_email add column if not exists error text;
alter table outbound_email alter column tenant_id drop not null;

-- 2) notification: bounded retry lane (WO-288 e) — an attempts counter plus a
--    terminal 'dead' state for rows that exhausted retries or are undeliverable
--    by definition (dead matter ref, stale reminder). The existing
--    notification_due_idx (status, scheduled_for) already serves the retry pickup.
alter table notification add column if not exists attempts int not null default 0;
alter table notification drop constraint if exists notification_status_check;
alter table notification add constraint notification_status_check
  check (status in ('pending', 'sent', 'failed', 'dead'));
