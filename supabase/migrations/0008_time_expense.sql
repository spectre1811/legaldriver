-- Phase 2 · P6 (keyless core): time + expense tracking. Money as integer minor units
-- (paise). Rate resolution: matter override → timekeeper rate → tenant default.
alter table tenant  add column if not exists default_rate_minor bigint;
alter table profile add column if not exists rate_minor bigint;
alter table matter  add column if not exists rate_minor bigint;

create table if not exists time_entry (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id) on delete cascade,
  matter_id uuid not null references matter (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  entry_date date not null default current_date,
  minutes int not null check (minutes >= 0),
  billable boolean not null default true,
  rate_minor bigint not null default 0,
  narrative text,
  invoiced_invoice_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists time_entry_tenant_idx on time_entry (tenant_id);
create index if not exists time_entry_matter_idx on time_entry (matter_id);

create table if not exists expense (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id) on delete cascade,
  matter_id uuid not null references matter (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  entry_date date not null default current_date,
  category text not null default 'other',
  amount_minor bigint not null check (amount_minor >= 0),
  billable boolean not null default true,
  notes text,
  invoiced_invoice_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists expense_tenant_idx on expense (tenant_id);
create index if not exists expense_matter_idx on expense (matter_id);

do $$
declare t text;
begin
  foreach t in array array['time_entry','expense'] loop
    execute format('alter table %I enable row level security;', t);
    if not exists (select 1 from pg_policies where tablename=t and policyname=t||'_select') then
      execute format('create policy %1$s_select on %1$I for select using (tenant_id = current_tenant_id());', t);
      execute format('create policy %1$s_insert on %1$I for insert with check (tenant_id = current_tenant_id());', t);
      execute format('create policy %1$s_update on %1$I for update using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());', t);
      execute format('create policy %1$s_delete on %1$I for delete using (tenant_id = current_tenant_id());', t);
    end if;
  end loop;
end $$;
