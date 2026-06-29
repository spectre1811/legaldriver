-- Onboarding · Phase D — deadline materializer in PROPOSE-FOR-CONFIRMATION mode.
-- Auto-computed legal deadlines are risky (a wrong limitation date prejudices a
-- client), so the materializer writes them as 'proposed'; the advocate confirms
-- (→ 'open' + reminders) or dismisses. Adds the two statuses + provenance columns.

alter table deadline drop constraint if exists deadline_status_check;
alter table deadline add constraint deadline_status_check
  check (status in ('open','done','waived','proposed','dismissed'));

alter table deadline add column if not exists source text not null default 'manual';  -- 'manual' | 'materializer'
alter table deadline add column if not exists basis  text;                            -- what it was computed from
