-- 0028_ai_usage_event.sql — per-tenant AI usage ledger (WO-02 Wave 3, 04-AI §5).
-- Written by the AI gateway after every call. Powers per-tenant metering, the cost
-- dashboard, and (post-WO-04, once tiers/billing exist) budget enforcement.
-- Observability only — NO PII: stores token COUNTS + routing metadata, never the
-- prompt or response content.

create table if not exists ai_usage_event (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  task        text not null,                  -- 'summary.case','draft.document',…
  model       text,                           -- served model (or 'router-default')
  backend     text,                           -- 'litellm'|'deepseek'|'custom'|'keyless-router'
  tier        text,                           -- 'cheap'|'frontier'|'vision'
  tokens_in   integer not null default 0,
  tokens_out  integer not null default 0,
  cost_usd    numeric(12,6) not null default 0,
  cache_hit   boolean not null default false,
  ok          boolean not null default true,
  estimated   boolean not null default false, -- true when no provider usage (e.g. CLI) → estimated
  trace_id    text,                           -- correlates with the Langfuse/stdout trace
  created_at  timestamptz not null default now()
);
-- (tenant_id, created_at desc) serves both recent-first listing and month-to-date
-- range scans (WHERE tenant_id=? AND created_at >= month_start). A functional index
-- on date_trunc('month', created_at) can't be used — date_trunc over timestamptz is
-- not IMMUTABLE — and isn't needed given the range index.
create index if not exists ai_usage_event_tenant_idx on ai_usage_event (tenant_id, created_at desc);

-- ── RLS (standard 4 policies keyed to current_tenant_id()) ────────────────────
-- The gateway writes via the service-role admin client, which bypasses RLS — it
-- always sets tenant_id explicitly (CLAUDE.md §1). These policies protect every
-- non-service-role read/write path.
do $$
declare t text;
begin
  foreach t in array array['ai_usage_event'] loop
    execute format('alter table %I enable row level security;', t);
    if not exists (select 1 from pg_policies where tablename=t and policyname=t||'_select') then
      execute format('create policy %1$s_select on %1$I for select using (tenant_id = current_tenant_id());', t);
      execute format('create policy %1$s_insert on %1$I for insert with check (tenant_id = current_tenant_id());', t);
      execute format('create policy %1$s_update on %1$I for update using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());', t);
      execute format('create policy %1$s_delete on %1$I for delete using (tenant_id = current_tenant_id());', t);
    end if;
  end loop;
end $$;

-- Month-to-date rollup (drives the cost dashboard + soft-warn). security_invoker
-- so the view RESPECTS the querying role's RLS (PG15+); without it a view runs as
-- its owner and would bypass tenant isolation.
create or replace view ai_usage_monthly with (security_invoker = true) as
  select tenant_id,
         date_trunc('month', created_at) as month,
         count(*)              as calls,
         sum(tokens_in)        as tokens_in,
         sum(tokens_out)       as tokens_out,
         sum(cost_usd)         as cost_usd,
         sum((cache_hit)::int) as cache_hits
  from ai_usage_event
  group by tenant_id, date_trunc('month', created_at);
