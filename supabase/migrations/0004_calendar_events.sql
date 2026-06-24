-- Manual calendar entries (meetings, personal reminders, follow-ups) — optionally
-- linked to a matter. Distinct from case-bound `deadline`/`hearing`.
create table if not exists calendar_event (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant (id) on delete cascade,
  title       text not null,
  event_date  date not null,
  kind        text not null default 'event',
  matter_id   uuid references matter (id) on delete set null,
  notes       text,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists calendar_event_tenant_idx on calendar_event (tenant_id);

alter table calendar_event enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='calendar_event' and policyname='calendar_event_select') then
    create policy calendar_event_select on calendar_event for select using (tenant_id = current_tenant_id());
    create policy calendar_event_insert on calendar_event for insert with check (tenant_id = current_tenant_id());
    create policy calendar_event_update on calendar_event for update using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
    create policy calendar_event_delete on calendar_event for delete using (tenant_id = current_tenant_id());
  end if;
end $$;
