-- Phase 2 · P8: Client portal. A portal user is an auth user linked to EXACTLY ONE
-- client. Strict isolation: portal users have NO profile row, so the firm-side
-- current_tenant_id() policies never match them; dedicated portal_* policies grant
-- access to only their own client's rows. This is the highest-risk boundary — see
-- tests/portal_isolation.ts.

create table if not exists portal_user (
  id uuid primary key references auth.users (id) on delete cascade,
  tenant_id uuid not null references tenant (id) on delete cascade,
  client_id uuid not null references client (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists portal_user_tenant_idx on portal_user (tenant_id);

create table if not exists portal_message (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id) on delete cascade,
  client_id uuid not null references client (id) on delete cascade,
  matter_id uuid references matter (id) on delete set null,
  sender text not null check (sender in ('firm','client')),
  sender_user_id uuid references auth.users (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists portal_message_tenant_idx on portal_message (tenant_id);
create index if not exists portal_message_client_idx on portal_message (client_id);

alter table document add column if not exists portal_shared boolean not null default false;

-- Portal identity resolvers (SECURITY DEFINER; read portal_user for auth.uid()).
create or replace function portal_tenant_id() returns uuid language sql stable security definer set search_path = public as $$
  select tenant_id from portal_user where id = auth.uid();
$$;
create or replace function portal_client_id() returns uuid language sql stable security definer set search_path = public as $$
  select client_id from portal_user where id = auth.uid();
$$;

-- New-user bootstrap must SKIP portal users (they must NOT get a firm profile/tenant,
-- which would otherwise grant firm-side access via current_tenant_id()).
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare new_tenant_id uuid;
begin
  if coalesce(new.raw_user_meta_data->>'is_portal','') = 'true' then
    return new; -- portal users are linked via portal_user, not profile
  end if;
  insert into tenant (name)
    values (coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)) || '''s workspace')
    returning id into new_tenant_id;
  insert into profile (id, tenant_id, full_name, role)
    values (new.id, new_tenant_id, new.raw_user_meta_data->>'full_name', 'owner');
  return new;
end $$;

-- RLS: portal_user
alter table portal_user enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='portal_user' and policyname='portal_user_firm') then
    -- firm manages its tenant's portal users
    create policy portal_user_firm on portal_user for all using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
    -- a portal user can read only their own mapping row
    create policy portal_user_self on portal_user for select using (id = auth.uid());
  end if;
end $$;

-- RLS: portal_message — firm sees its tenant's; portal sees only its client's; both insert.
alter table portal_message enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='portal_message' and policyname='portal_message_firm_sel') then
    create policy portal_message_firm_sel on portal_message for select using (tenant_id = current_tenant_id());
    create policy portal_message_firm_ins on portal_message for insert with check (tenant_id = current_tenant_id());
    create policy portal_message_cli_sel on portal_message for select using (tenant_id = portal_tenant_id() and client_id = portal_client_id());
    create policy portal_message_cli_ins on portal_message for insert with check (tenant_id = portal_tenant_id() and client_id = portal_client_id() and sender = 'client');
  end if;
end $$;

-- Additive portal SELECT policies (OR'd with the firm policies) on shared resources.
do $$ begin
  if not exists (select 1 from pg_policies where tablename='matter' and policyname='matter_portal_sel') then
    create policy matter_portal_sel on matter for select using (tenant_id = portal_tenant_id() and client_id = portal_client_id());
  end if;
  if not exists (select 1 from pg_policies where tablename='hearing' and policyname='hearing_portal_sel') then
    create policy hearing_portal_sel on hearing for select using (tenant_id = portal_tenant_id() and matter_id in (select id from matter where client_id = portal_client_id()));
  end if;
  if not exists (select 1 from pg_policies where tablename='document' and policyname='document_portal_sel') then
    create policy document_portal_sel on document for select using (
      portal_shared and tenant_id = portal_tenant_id()
      and (client_id = portal_client_id() or matter_id in (select id from matter where client_id = portal_client_id()))
    );
  end if;
  if not exists (select 1 from pg_policies where tablename='client' and policyname='client_portal_sel') then
    create policy client_portal_sel on client for select using (id = portal_client_id());
  end if;
end $$;
