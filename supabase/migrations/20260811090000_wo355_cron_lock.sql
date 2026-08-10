-- WO-355 W1 — cron mutual exclusion (lease mutex).
-- INERT until founder-applied; code is fail-soft both directions: table/function absent
-- → handlers run unguarded exactly as today (one warn log); applied table + CRON_LOCK unset
-- → functions exist but are never called. Rollback: drop the two functions + the table.
--
-- Lease TTL default 900s (15 min = 3× the 5-min notify cadence): a run in the 5–15 min band
-- keeps its lease (no pile-up — WO-355 W3 acceptance); only a crashed run blocks its job, ≤15 min.

create table if not exists public.cron_lock (
  job_name    text primary key,
  lease_until timestamptz not null,
  holder      text not null
);

comment on table public.cron_lock is
  'WO-355: one row per cron job; a handler holds the lease or exits. Service-role only.';

-- Service-role-only surface: RLS on with NO policies (service_role bypasses RLS; everyone
-- else is denied). Do not add policies — this table has no user-facing reads.
alter table public.cron_lock enable row level security;

-- Atomic acquire-or-nothing. Returns a row {acquired:true, stale:bool} when the lease was
-- taken; returns NO row (rpc data = null) when a live lease exists — callers treat anything
-- without acquired=true as "did not acquire". `stale` = an EXPIRED lease was stolen (xmax<>0
-- marks the conflict-update path) — i.e. the previous run crashed or overran its TTL; the
-- caller surfaces this as the lease-expiries counter (WO-355 observability line).
create or replace function public.try_acquire_cron_lock(
  p_job text, p_holder text, p_ttl_seconds int default 900
) returns jsonb
language sql
security definer
set search_path = public
as $$
  insert into cron_lock (job_name, lease_until, holder)
  values (p_job, now() + make_interval(secs => p_ttl_seconds), p_holder)
  on conflict (job_name) do update
    set lease_until = excluded.lease_until,
        holder      = excluded.holder
    where cron_lock.lease_until < now()
  returning jsonb_build_object('acquired', true, 'stale', xmax::text <> '0');
$$;

-- Holder-guarded release: never deletes a lease that was re-acquired by someone else
-- after this holder's lease expired mid-run.
create or replace function public.release_cron_lock(p_job text, p_holder text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from cron_lock where job_name = p_job and holder = p_holder;
$$;

-- WO-355 W2 — bounded refresh scan. The nightly refresh selected ALL matters (unbounded as
-- tenants grow); the route now orders by staleness + LIMITs in the DB. NULLS FIRST matches
-- the query's nullsFirst (never-synced matters are the stalest); default asc index is
-- nulls-last and would not serve this scan.
create index if not exists idx_matter_refresh_scan
  on public.matter (last_synced_at asc nulls first)
  where deleted_at is null and cnr is not null;

-- Postgres grants EXECUTE on new functions to PUBLIC by default, and PostgREST exposes
-- public functions as /rpc/* — without these revokes, anon could acquire/hold cron leases
-- and starve every cron job. Service role is the only caller.
revoke execute on function public.try_acquire_cron_lock(text, text, int) from public, anon, authenticated;
revoke execute on function public.release_cron_lock(text, text) from public, anon, authenticated;
grant execute on function public.try_acquire_cron_lock(text, text, int) to service_role;
grant execute on function public.release_cron_lock(text, text) to service_role;
