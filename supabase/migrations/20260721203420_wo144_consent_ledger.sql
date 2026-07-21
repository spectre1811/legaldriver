-- WO-144 W2 — INERT until founder-approved apply. Present before apply.
-- consent_ledger: append-only DPDP consent ledger for WhatsApp messaging.
-- One row per grant; opt-out closes the row by stamping opt_out_at (never a
-- delete/rewrite). tenant_id is NULLABLE — a webhook STOP can arrive before the
-- number is mapped to a tenant.
--
-- tenant_id is ON DELETE SET NULL (not cascade): this is a compliance ledger
-- about the NUMBER, and the record must OUTLIVE the tenant — a tenant
-- hard-delete orphans the rows to null rather than deleting them (a cascade
-- delete would also collide with the always-raise delete trigger below). The
-- update guard therefore permits exactly two row transitions: opt_out_at
-- null -> timestamp (once), and tenant_id -> null (the SET NULL orphaning).

create table if not exists consent_ledger (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid references tenant (id) on delete set null,
  number          text not null,                    -- E.164
  purpose         text not null check (purpose in ('service','marketing')),
  source          text not null,                    -- capture URL / form id
  wording_version text not null default 'v1',
  granted_at      timestamptz not null default now(),
  opt_out_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists consent_ledger_number_idx on consent_ledger (number, purpose, granted_at desc);

-- RLS: standard tenant policies (0011 style) MINUS delete — the ledger is
-- append-only, so no DELETE policy exists at all (deny-by-default).
do $$
declare t text := 'consent_ledger';
begin
  execute format('alter table %I enable row level security;', t);
  if not exists (select 1 from pg_policies where tablename=t and policyname=t||'_select') then
    execute format('create policy %1$s_select on %1$I for select using (tenant_id = current_tenant_id());', t);
    execute format('create policy %1$s_insert on %1$I for insert with check (tenant_id = current_tenant_id());', t);
    execute format('create policy %1$s_update on %1$I for update using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());', t);
    -- no _delete policy: append-only compliance ledger.
  end if;
end $$;

-- Append-only enforcement at the table level (RLS alone is not enough — the
-- service-role client bypasses it). Deletes always raise; updates raise unless
-- every change is one of the two permitted transitions:
--   * opt_out_at: null -> timestamp, once;
--   * tenant_id: -> null (the ON DELETE SET NULL orphaning above).
create or replace function consent_ledger_block_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'consent_ledger is append-only (DPDP compliance ledger): deletes are not allowed';
end $$;

create or replace function consent_ledger_guard_update() returns trigger
language plpgsql as $$
begin
  if new.id                 is distinct from old.id
     or new.number          is distinct from old.number
     or new.purpose         is distinct from old.purpose
     or new.source          is distinct from old.source
     or new.wording_version is distinct from old.wording_version
     or new.granted_at      is distinct from old.granted_at
     or new.created_at      is distinct from old.created_at
     -- tenant_id may only be orphaned to null (tenant hard-delete SET NULL):
     or (new.tenant_id is distinct from old.tenant_id and new.tenant_id is not null)
     -- opt_out_at may only be set once, null -> timestamp:
     or (new.opt_out_at is distinct from old.opt_out_at
         and (old.opt_out_at is not null or new.opt_out_at is null)) then
    raise exception 'consent_ledger is append-only (DPDP compliance ledger): only opt_out_at (null -> timestamp, once) and tenant_id (-> null) may change';
  end if;
  return new;
end $$;

drop trigger if exists consent_ledger_block_delete_trg on consent_ledger;
create trigger consent_ledger_block_delete_trg
  before delete on consent_ledger
  for each row execute function consent_ledger_block_delete();

drop trigger if exists consent_ledger_guard_update_trg on consent_ledger;
create trigger consent_ledger_guard_update_trg
  before update on consent_ledger
  for each row execute function consent_ledger_guard_update();
