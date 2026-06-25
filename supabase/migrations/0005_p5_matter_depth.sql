-- Phase 2 · P5: matter depth foundation — practice areas, custom field defs,
-- activity timeline, adverse parties (for conflict checks). All tenant-owned + RLS.

create table if not exists practice_area (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create index if not exists practice_area_tenant_idx on practice_area (tenant_id);

create table if not exists custom_field_def (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id) on delete cascade,
  entity text not null check (entity in ('client','matter')),
  practice_area_id uuid references practice_area (id) on delete set null,
  key text not null,
  label text not null,
  field_type text not null default 'text' check (field_type in ('text','number','date','checkbox','select')),
  options jsonb not null default '[]',
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists custom_field_def_tenant_idx on custom_field_def (tenant_id);

-- Unified, append-only activity feed per matter (and tenant-wide).
create table if not exists activity_event (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id) on delete cascade,
  matter_id uuid references matter (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  type text not null,
  summary text not null,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists activity_event_tenant_idx on activity_event (tenant_id);
create index if not exists activity_event_matter_idx on activity_event (matter_id);

-- Opposing/adverse parties recorded per matter — fed into conflict checks.
create table if not exists adverse_party (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id) on delete cascade,
  matter_id uuid references matter (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create index if not exists adverse_party_tenant_idx on adverse_party (tenant_id);

-- Practice area reference on matter.
alter table matter add column if not exists practice_area_id uuid references practice_area (id) on delete set null;

-- RLS: full CRUD on practice_area/custom_field_def/adverse_party; append-only on activity_event.
do $$
declare t text;
begin
  foreach t in array array['practice_area','custom_field_def','adverse_party'] loop
    execute format('alter table %I enable row level security;', t);
    if not exists (select 1 from pg_policies where tablename=t and policyname=t||'_select') then
      execute format('create policy %1$s_select on %1$I for select using (tenant_id = current_tenant_id());', t);
      execute format('create policy %1$s_insert on %1$I for insert with check (tenant_id = current_tenant_id());', t);
      execute format('create policy %1$s_update on %1$I for update using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());', t);
      execute format('create policy %1$s_delete on %1$I for delete using (tenant_id = current_tenant_id());', t);
    end if;
  end loop;
end $$;

alter table activity_event enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='activity_event' and policyname='activity_event_select') then
    create policy activity_event_select on activity_event for select using (tenant_id = current_tenant_id());
    create policy activity_event_insert on activity_event for insert with check (tenant_id = current_tenant_id());
  end if;
end $$;
