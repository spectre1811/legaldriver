-- Phase 2 · P10: IPR module — trademarks/patents/etc. with renewal deadlines that
-- feed the existing reminder engine + calendar. Tenant-owned + RLS.
create table if not exists ip_asset (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id) on delete cascade,
  type text not null default 'trademark' check (type in ('trademark','patent','copyright','design')),
  title text not null,
  registration_no text,
  jurisdiction text,
  status text not null default 'registered',
  renewal_date date,
  client_id uuid references client (id) on delete set null,
  matter_id uuid references matter (id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists ip_asset_tenant_idx on ip_asset (tenant_id);

alter table ip_asset enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='ip_asset' and policyname='ip_asset_select') then
    create policy ip_asset_select on ip_asset for select using (tenant_id = current_tenant_id());
    create policy ip_asset_insert on ip_asset for insert with check (tenant_id = current_tenant_id());
    create policy ip_asset_update on ip_asset for update using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
    create policy ip_asset_delete on ip_asset for delete using (tenant_id = current_tenant_id());
  end if;
end $$;
