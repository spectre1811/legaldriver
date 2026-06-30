-- Wave 1 · Outbound email logging. Resend sends (invoices, reminders, notices)
-- weren't recorded, so the Communications timeline was inbound-only. Log them and
-- union into communication_log so the timeline is two-way. No PII beyond subject +
-- recipient (consistent with the rest of comms).

create table if not exists outbound_email (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  to_addr     text not null,
  subject     text,
  kind        text not null default 'other',   -- 'invoice' | 'reminder' | 'notice' | 'other'
  matter_id   uuid references matter(id) on delete set null,
  client_id   uuid references client(id) on delete set null,
  status      text not null default 'sent',    -- 'sent' | 'failed'
  provider_id text,                             -- Resend message id
  created_at  timestamptz not null default now()
);
create index if not exists outbound_email_tenant_idx on outbound_email (tenant_id);

do $$
declare t text;
begin
  foreach t in array array['outbound_email'] loop
    execute format('alter table %I enable row level security;', t);
    if not exists (select 1 from pg_policies where tablename=t and policyname=t||'_select') then
      execute format('create policy %1$s_select on %1$I for select using (tenant_id = current_tenant_id());', t);
      execute format('create policy %1$s_insert on %1$I for insert with check (tenant_id = current_tenant_id());', t);
      execute format('create policy %1$s_update on %1$I for update using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());', t);
      execute format('create policy %1$s_delete on %1$I for delete using (tenant_id = current_tenant_id());', t);
    end if;
  end loop;
end $$;

-- Recreate the timeline view with the outbound-email union (keeps security_invoker).
create or replace view communication_log
with (security_invoker = true) as
  select e.id, 'email'::text as channel, 'in'::text as direction, e.tenant_id,
    e.from_addr as counterparty, e.subject, e.snippet as preview,
    e.classified_client_id as client_id, e.classified_matter_id as matter_id,
    e.received_at as occurred_at, e.status
  from email_message e
  union all
  select m.id, m.channel, m.direction, m.tenant_id,
    case when m.direction = 'in' then m.from_addr else m.to_addr end as counterparty,
    null::text as subject, m.body as preview, m.client_id, m.matter_id, m.created_at as occurred_at, m.status
  from msg_message m
  union all
  select o.id, 'email'::text as channel, 'out'::text as direction, o.tenant_id,
    o.to_addr as counterparty, o.subject, coalesce(o.subject, o.kind) as preview,
    o.client_id, o.matter_id, o.created_at as occurred_at, o.status
  from outbound_email o;

grant select on communication_log to authenticated;
