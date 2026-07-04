-- WO-30 W2 (founder-approved 2026-07-05) — profile depth + notification preferences.
--
-- The `profile` table already exists (0001_init) with: id (= auth.uid()), tenant_id, full_name
-- (captured at signup but never surfaced — the audit's "collects full_name then ignores it"),
-- role, created_at, rate_minor, locale (0029). We only ADD the missing self-service fields and a
-- per-user notification_prefs table. Idempotent; safe to run repeatedly and before/without the app.
--
-- RLS mirrors `profile` (0001): the tenant can SELECT (firm-wide visibility), but only the owning
-- user (id = auth.uid()) may INSERT/UPDATE their own row. No cross-tenant leakage.

-- (1) Profile self-service fields (full_name already exists).
alter table profile
  add column if not exists phone       text,
  add column if not exists designation text,
  add column if not exists chamber     text,
  add column if not exists photo_url   text;

-- (2) Per-user notification preferences (1:1 with profile). WhatsApp number + channel toggles +
--     quiet hours + daily cause-list send time. Delivery wiring lands with WO-04 (BSP)/WO-17.
create table if not exists notification_prefs (
  id               uuid primary key references profile(id) on delete cascade,
  tenant_id        uuid not null references tenant(id) on delete cascade,
  whatsapp_number  text,
  channel_whatsapp boolean not null default false,
  channel_email    boolean not null default true,
  channel_sms      boolean not null default false,
  quiet_start      time,
  quiet_end        time,
  cause_list_time  time not null default '07:00',
  updated_at       timestamptz not null default now()
);

alter table notification_prefs enable row level security;

drop policy if exists notification_prefs_select on notification_prefs;
create policy notification_prefs_select on notification_prefs
  for select using (tenant_id = current_tenant_id());

drop policy if exists notification_prefs_insert on notification_prefs;
create policy notification_prefs_insert on notification_prefs
  for insert with check (id = auth.uid() and tenant_id = current_tenant_id());

drop policy if exists notification_prefs_update on notification_prefs;
create policy notification_prefs_update on notification_prefs
  for update using (id = auth.uid()) with check (id = auth.uid());
