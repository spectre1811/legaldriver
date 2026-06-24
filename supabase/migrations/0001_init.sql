-- LexDriver — initial schema, multi-tenant with Postgres RLS.
-- Convention: every tenant-owned table carries tenant_id and is RLS-protected,
-- deny-by-default. Money as integer minor units. Timestamps timestamptz.
-- Court data is informational; provenance (source + last_synced_at) is stored on it.

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- Tenancy + identity
-- ─────────────────────────────────────────────────────────────────────────────

create table tenant (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  plan        text not null default 'free',
  created_at  timestamptz not null default now()
);

-- profile links an auth.users row to a tenant. role gates capabilities.
create table profile (
  id          uuid primary key references auth.users (id) on delete cascade,
  tenant_id   uuid not null references tenant (id) on delete cascade,
  full_name   text,
  role        text not null default 'owner' check (role in ('owner', 'lawyer', 'staff')),
  created_at  timestamptz not null default now()
);
create index profile_tenant_idx on profile (tenant_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS helpers. current_tenant_id() resolves the authed user's tenant from their
-- profile. SECURITY DEFINER so the lookup itself isn't gated by RLS (avoids
-- recursion). Used by every tenant-owned policy below.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from profile where id = auth.uid();
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Domain tables (all tenant-owned)
-- ─────────────────────────────────────────────────────────────────────────────

create table advocate (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references tenant (id) on delete cascade,
  name                     text not null,
  bar_registration_number  text,
  state_code               text,
  courts                   text[] not null default '{}',
  created_at               timestamptz not null default now()
);
create index advocate_tenant_idx on advocate (tenant_id);

create table client (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant (id) on delete cascade,
  name        text not null,
  type        text not null default 'individual' check (type in ('org', 'individual')),
  emails      text[] not null default '{}',
  phones      text[] not null default '{}',
  custom      jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index client_tenant_idx on client (tenant_id);

create table matter (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenant (id) on delete cascade,
  client_id          uuid references client (id) on delete set null,
  cnr                text,
  title              text not null,
  court              text,
  case_type          text,
  parties            jsonb not null default '{}',
  stage              text,
  status             text not null default 'active',
  next_hearing_date  date,
  last_synced_at     timestamptz,
  source             text,
  created_at         timestamptz not null default now()
);
create index matter_tenant_idx on matter (tenant_id);
create unique index matter_tenant_cnr_uniq on matter (tenant_id, cnr) where cnr is not null;

create table hearing (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant (id) on delete cascade,
  matter_id   uuid not null references matter (id) on delete cascade,
  date        date not null,
  purpose     text,
  court_no    text,
  judge       text,
  raw         jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index hearing_tenant_idx on hearing (tenant_id);
create index hearing_matter_idx on hearing (matter_id);

create table deadline (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenant (id) on delete cascade,
  matter_id          uuid not null references matter (id) on delete cascade,
  kind               text not null,
  due_date           date not null,
  jurisdiction_rule  text,
  status             text not null default 'open' check (status in ('open', 'done', 'waived')),
  created_at         timestamptz not null default now()
);
create index deadline_tenant_idx on deadline (tenant_id);

create table cause_list_entry (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenant (id) on delete cascade,
  advocate_id  uuid not null references advocate (id) on delete cascade,
  list_date    date not null,
  court        text,
  item_no      text,
  cnr          text,
  matter_id    uuid references matter (id) on delete set null,
  raw          jsonb not null default '{}',
  created_at   timestamptz not null default now()
);
create index cause_list_tenant_idx on cause_list_entry (tenant_id);
create unique index cause_list_uniq on cause_list_entry (tenant_id, advocate_id, list_date, item_no);

create table notice (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenant (id) on delete cascade,
  matter_id           uuid references matter (id) on delete set null,
  client_id           uuid references client (id) on delete set null,
  type                text not null,
  sent_at             timestamptz,
  response_due        date,
  escalation_state    text not null default 'draft'
                        check (escalation_state in
                          ('draft','sent','awaiting_response','responded','escalated_1','escalated_2','closed')),
  next_escalation_at  timestamptz,
  body_ref            text,
  created_at          timestamptz not null default now()
);
create index notice_tenant_idx on notice (tenant_id);

create table notification (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenant (id) on delete cascade,
  user_id        uuid references auth.users (id) on delete cascade,
  channel        text not null check (channel in ('inapp', 'email')),
  kind           text not null,
  payload        jsonb not null default '{}',
  scheduled_for  timestamptz,
  sent_at        timestamptz,
  status         text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  created_at     timestamptz not null default now()
);
create index notification_tenant_idx on notification (tenant_id);
create index notification_due_idx on notification (status, scheduled_for);

create table email_message (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references tenant (id) on delete cascade,
  user_id                uuid references auth.users (id) on delete set null,
  gmail_id               text not null,
  gmail_history_id       text,
  from_addr              text,
  subject                text,
  received_at            timestamptz,
  snippet                text,
  classified_client_id   uuid references client (id) on delete set null,
  classified_matter_id   uuid references matter (id) on delete set null,
  confidence             numeric(4,3),
  status                 text not null default 'pending'
                           check (status in ('pending', 'filed', 'needs_review')),
  created_at             timestamptz not null default now()
);
create index email_message_tenant_idx on email_message (tenant_id);
create unique index email_message_gmail_uniq on email_message (tenant_id, gmail_id);

create table document (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenant (id) on delete cascade,
  source            text not null check (source in ('gmail', 'upload', 'court_order')),
  storage_path      text,
  filename          text,
  mime              text,
  parsed_text       text,
  doc_type          text,
  client_id         uuid references client (id) on delete set null,
  matter_id         uuid references matter (id) on delete set null,
  extracted         jsonb not null default '{}',
  email_message_id  uuid references email_message (id) on delete set null,
  created_at        timestamptz not null default now()
);
create index document_tenant_idx on document (tenant_id);

create table court_sync_job (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenant (id) on delete cascade,
  cnr          text not null,
  last_run_at  timestamptz,
  next_run_at  timestamptz,
  status       text not null default 'pending',
  error        text,
  created_at   timestamptz not null default now()
);
create index court_sync_job_tenant_idx on court_sync_job (tenant_id);

create table oauth_connection (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references tenant (id) on delete cascade,
  user_id                uuid not null references auth.users (id) on delete cascade,
  provider               text not null default 'google' check (provider in ('google')),
  scopes                 text[] not null default '{}',
  refresh_token_ref      text,   -- pointer into Supabase Vault; never the token itself
  gmail_last_history_id  text,
  status                 text not null default 'active' check (status in ('active', 'revoked')),
  created_at             timestamptz not null default now()
);
create index oauth_connection_tenant_idx on oauth_connection (tenant_id);

-- Append-only audit trail. No update/delete policy is granted (immutable by RLS).
create table audit_event (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant (id) on delete cascade,
  actor_id    uuid references auth.users (id) on delete set null,
  action      text not null,
  entity      text,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);
create index audit_event_tenant_idx on audit_event (tenant_id);

-- Jurisdiction deadline rules — reference/config, editable & auditable.
-- NOT tenant-owned by default (shared rules); a tenant_id of null = global rule.
create table deadline_rule (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references tenant (id) on delete cascade,
  jurisdiction  text not null,
  trigger       text not null,        -- e.g. 'order:appeal', 'hearing:reply'
  kind          text not null,        -- e.g. 'appeal_period'
  days          integer not null,
  description   text,
  created_at    timestamptz not null default now()
);
create index deadline_rule_tenant_idx on deadline_rule (tenant_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row-Level Security: enable on every table, deny-by-default, then grant
-- tenant-scoped access keyed to current_tenant_id().
-- ─────────────────────────────────────────────────────────────────────────────

-- profile: a user sees profiles within their own tenant.
alter table profile enable row level security;
create policy profile_select on profile for select using (tenant_id = current_tenant_id());
create policy profile_update on profile for update using (id = auth.uid()) with check (id = auth.uid());

-- tenant: a user sees only their own tenant row.
alter table tenant enable row level security;
create policy tenant_select on tenant for select using (id = current_tenant_id());

-- Generic tenant-owned tables get full CRUD scoped to the tenant.
do $$
declare t text;
begin
  foreach t in array array[
    'advocate','client','matter','hearing','deadline','cause_list_entry',
    'notice','notification','email_message','document','court_sync_job',
    'oauth_connection','deadline_rule'
  ]
  loop
    execute format('alter table %I enable row level security;', t);
    execute format(
      'create policy %1$s_select on %1$I for select using (tenant_id = current_tenant_id());', t);
    execute format(
      'create policy %1$s_insert on %1$I for insert with check (tenant_id = current_tenant_id());', t);
    execute format(
      'create policy %1$s_update on %1$I for update using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());', t);
    execute format(
      'create policy %1$s_delete on %1$I for delete using (tenant_id = current_tenant_id());', t);
  end loop;
end $$;

-- audit_event: insert + select only (append-only; no update/delete policy = denied).
alter table audit_event enable row level security;
create policy audit_select on audit_event for select using (tenant_id = current_tenant_id());
create policy audit_insert on audit_event for insert with check (tenant_id = current_tenant_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- New-user bootstrap: on first sign-in, create a tenant + owner profile so the
-- user lands in their own isolated workspace. Runs as definer to bypass RLS.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare new_tenant_id uuid;
begin
  insert into tenant (name)
    values (coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)) || '''s workspace')
    returning id into new_tenant_id;

  insert into profile (id, tenant_id, full_name, role)
    values (new.id, new_tenant_id, new.raw_user_meta_data->>'full_name', 'owner');

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
