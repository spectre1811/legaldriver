-- Advocate onboarding · Phase A — a resumable run cursor. The orchestrator runs
-- idempotent stages (cause-list seed → per-CNR enrich → inbox backfill → closed
-- cases → AI summaries) and records progress here so the UI can show it and the
-- job can resume after a timeout. See docs/decisions/2026-06-29-advocate-onboarding-workflow.md.

create table if not exists onboarding_run (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  advocate_id uuid references advocate(id) on delete set null,
  stage       text not null default 'queued',  -- queued|causelist|enrich|inbox|closed|summaries|done|error
  status      text not null default 'running' check (status in ('running','done','error')),
  cursor      jsonb not null default '{}',
  counts      jsonb not null default '{}',      -- {causelist,matters_seeded,enriched,inbox_filed,closed_found,summaries_queued}
  message     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists onboarding_run_tenant_idx on onboarding_run (tenant_id);

do $$
declare t text;
begin
  foreach t in array array['onboarding_run'] loop
    execute format('alter table %I enable row level security;', t);
    if not exists (select 1 from pg_policies where tablename=t and policyname=t||'_select') then
      execute format('create policy %1$s_select on %1$I for select using (tenant_id = current_tenant_id());', t);
      execute format('create policy %1$s_insert on %1$I for insert with check (tenant_id = current_tenant_id());', t);
      execute format('create policy %1$s_update on %1$I for update using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());', t);
      execute format('create policy %1$s_delete on %1$I for delete using (tenant_id = current_tenant_id());', t);
    end if;
  end loop;
end $$;
