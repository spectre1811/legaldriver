-- Wave 1 · Invoicing + GST. Assemble invoices from unbilled time/expense, apply
-- Indian GST (intra-state CGST+SGST vs inter-state IGST, or reverse-charge), FY
-- numbering, and email. Money is paise (minor units), consistent with time/expense.
-- The invoiced_invoice_id columns already exist on time_entry/expense (0008) — we
-- add the FKs here. RLS on every new table (convention #1).

-- Firm-level billing/GST config (one row per tenant).
create table if not exists firm_billing (
  tenant_id       uuid primary key references tenant(id) on delete cascade,
  legal_name      text,
  address         text,
  gstin           text,
  state_code      text,                          -- place of supply of the firm, e.g. "24" (Gujarat)
  default_gst_rate numeric not null default 18,   -- % (legal services)
  reverse_charge  boolean not null default false, -- advocate→business often RCM (tax paid by recipient)
  hsn_sac         text not null default '9982',   -- SAC for legal services
  invoice_prefix  text not null default 'INV',
  bank_details    text,
  terms           text,
  updated_at      timestamptz not null default now()
);

create table if not exists invoice (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenant(id) on delete cascade,
  client_id       uuid references client(id) on delete set null,
  matter_id       uuid references matter(id) on delete set null,
  number          text,                          -- null until finalised (PREFIX/FY/seq)
  fy              text,                          -- "2026-27"
  issue_date      date not null default current_date,
  due_date        date,
  status          text not null default 'draft'
                  check (status in ('draft','sent','paid','cancelled')),
  place_of_supply text,                          -- recipient state code; drives CGST/SGST vs IGST
  reverse_charge  boolean not null default false,
  gst_rate        numeric not null default 18,
  subtotal_minor  bigint not null default 0,
  cgst_minor      bigint not null default 0,
  sgst_minor      bigint not null default 0,
  igst_minor      bigint not null default 0,
  total_minor     bigint not null default 0,
  notes           text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists invoice_tenant_idx on invoice (tenant_id);
create index if not exists invoice_client_idx on invoice (client_id);
create index if not exists invoice_matter_idx on invoice (matter_id);

create table if not exists invoice_line (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  invoice_id  uuid not null references invoice(id) on delete cascade,
  kind        text not null default 'manual' check (kind in ('time','expense','manual')),
  description text not null,
  hsn_sac     text,
  quantity    numeric not null default 1,
  unit        text,                              -- 'hrs' | 'item' | null
  rate_minor  bigint not null default 0,
  amount_minor bigint not null default 0,
  source_time_entry_id uuid references time_entry(id) on delete set null,
  source_expense_id    uuid references expense(id) on delete set null,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists invoice_line_invoice_idx on invoice_line (invoice_id);

-- Now that invoice exists, add the FKs from the billing tables (columns from 0008).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'time_entry_invoiced_invoice_id_fkey') then
    alter table time_entry add constraint time_entry_invoiced_invoice_id_fkey
      foreign key (invoiced_invoice_id) references invoice(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expense_invoiced_invoice_id_fkey') then
    alter table expense add constraint expense_invoiced_invoice_id_fkey
      foreign key (invoiced_invoice_id) references invoice(id) on delete set null;
  end if;
end $$;

-- ── RLS (standard 4 policies keyed to current_tenant_id()) ────────────────────
do $$
declare t text;
begin
  foreach t in array array['firm_billing','invoice','invoice_line'] loop
    execute format('alter table %I enable row level security;', t);
    if not exists (select 1 from pg_policies where tablename=t and policyname=t||'_select') then
      execute format('create policy %1$s_select on %1$I for select using (tenant_id = current_tenant_id());', t);
      execute format('create policy %1$s_insert on %1$I for insert with check (tenant_id = current_tenant_id());', t);
      execute format('create policy %1$s_update on %1$I for update using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());', t);
      execute format('create policy %1$s_delete on %1$I for delete using (tenant_id = current_tenant_id());', t);
    end if;
  end loop;
end $$;
