-- WO-290 / WO-288 W2: anon-callable health snapshot for the external GChat alarm poller.
-- Returns up/down status + timestamp only (NO error bodies) — safe for the public anon key.
-- Applied to prod 2026-07-31 via the Management API (this file is the schema-of-record).
create or replace function public.get_provider_health()
returns table(provider text, ok boolean, updated_at timestamptz)
language sql security definer set search_path = public as $$
  select provider, ok, updated_at from court_provider_health
  where provider in ('email-sendpath','refresh-cron','deploy-freshness','legaldriver-canary')
$$;
grant execute on function public.get_provider_health() to anon, authenticated;
