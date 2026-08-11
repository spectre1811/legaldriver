-- WO-359 W2 — in-flight refresh coalescing (lock row).
--
-- Why a table and not pg_advisory_xact_lock: every supabase-js .rpc() runs in its OWN
-- implicit transaction on a pooled connection, so a txn-scoped advisory lock releases the
-- instant the RPC returns — it cannot span the actual refresh work (Node → eCourts →
-- writeCache), which happens outside that transaction. A lock ROW survives across calls.
--
-- Separate from WO-355's cron_lock deliberately: different lifecycle (one short-lived row
-- per in-flight CNR vs ~10 static job rows, 30s TTL vs 900s). Same function shape and the
-- same hard-won REVOKE lesson.
--
-- INERT until founder-applied; the code is fail-soft both directions (table/function absent
-- OR REFRESH_COALESCE unset → today's unguarded refresh, one warn log).

create table if not exists refresh_lock (
  cnr         text primary key,
  lease_until timestamptz not null,
  holder      text not null,
  started_at  timestamptz not null default now()
);

comment on table refresh_lock is
  'WO-359: one row per in-flight case refresh. Leader holds; concurrent callers wait and reuse the persisted result. Service-role only.';

-- Service-role-only surface: RLS on with NO policies (service_role bypasses; all else denied).
alter table refresh_lock enable row level security;

-- Reaper index: expired-lease sweeps stay index-only rather than scanning a churny table.
create index if not exists idx_refresh_lock_expired on refresh_lock (lease_until);

-- Atomic acquire-or-nothing. Returns {acquired:true, stale:bool} when the lease was taken
-- (stale = an expired lease was stolen, i.e. the previous leader died mid-refresh); returns
-- NO row when a live lease exists — the caller becomes a waiter.
create or replace function public.try_acquire_refresh_lock(
  p_cnr text, p_holder text, p_ttl_seconds int default 30
) returns jsonb
language sql
security definer
set search_path = public
as $$
  insert into refresh_lock (cnr, lease_until, holder, started_at)
  values (p_cnr, now() + make_interval(secs => p_ttl_seconds), p_holder, now())
  on conflict (cnr) do update
    set lease_until = excluded.lease_until,
        holder      = excluded.holder,
        started_at  = now()
    where refresh_lock.lease_until < now()
  returning jsonb_build_object('acquired', true, 'stale', xmax::text <> '0');
$$;

-- Holder-guarded release: never deletes a lease re-acquired by someone else after this
-- holder's lease expired mid-refresh.
create or replace function public.release_refresh_lock(p_cnr text, p_holder text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from refresh_lock where cnr = p_cnr and holder = p_holder;
$$;

-- WO-355's lesson, applied verbatim: Postgres grants EXECUTE to PUBLIC by default and
-- PostgREST exposes public functions as /rpc/*. Without these revokes, anon could take and
-- hold a refresh lease for any CNR — blocking every refresh of that case. Service role only.
revoke execute on function public.try_acquire_refresh_lock(text, text, int) from public, anon, authenticated;
revoke execute on function public.release_refresh_lock(text, text) from public, anon, authenticated;
grant execute on function public.try_acquire_refresh_lock(text, text, int) to service_role;
grant execute on function public.release_refresh_lock(text, text) to service_role;
