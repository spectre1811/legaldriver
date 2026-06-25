-- Phase 3 · 0010 — Tier-1 foundations
--   E7  Court Data Gateway: read-through cache + provider health + human-in-the-loop refresh
--   E4  Rich case detail: detail jsonb + denormalized similarity arrays + court_order
--   E2  Document dedup: content_hash
--   E3  Saved views for the case console
-- No CAPTCHA solving / no scraping — resilience is cache + multi-provider + HITL (see E7 below).

-- ── E7 · Court Data Gateway ────────────────────────────────────────────────
-- Court records are public; the cache is SHARED across tenants (the big cost/
-- reliability win). Reached ONLY through the server-side gateway (service-role):
-- RLS is enabled with NO policies, so it is invisible to anon/authenticated.
create table if not exists court_cache (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('case','causelist','search','order')),
  cache_key   text not null,                 -- cnr, or a stable hash of the query
  provider    text not null,
  raw         jsonb,
  normalized  jsonb,
  fetched_at  timestamptz not null default now(),
  unique (kind, cache_key, provider)
);
create index if not exists court_cache_key_idx on court_cache (kind, cache_key);
create index if not exists court_cache_fetched_idx on court_cache (fetched_at);

create table if not exists court_provider_health (
  provider    text primary key,
  ok          boolean not null default true,
  last_ok_at  timestamptz,
  last_error  text,
  updated_at  timestamptz not null default now()
);

-- Human-in-the-loop refresh: when no provider can serve fresh data, the USER
-- solves any CAPTCHA on the official portal and pastes the returned payload;
-- the gateway parses it into court_cache + matter. We never auto-solve.
create table if not exists court_refresh_request (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenant (id) on delete cascade,
  matter_id       uuid references matter (id) on delete set null,
  cnr             text not null,
  requested_by    uuid references auth.users (id) on delete set null,
  status          text not null default 'pending' check (status in ('pending','fulfilled','cancelled')),
  pasted_payload  jsonb,
  note            text,
  created_at      timestamptz not null default now(),
  fulfilled_at    timestamptz
);
create index if not exists court_refresh_tenant_idx on court_refresh_request (tenant_id, status);

-- ── E4 · richer case detail + orders ───────────────────────────────────────
alter table matter add column if not exists detail         jsonb;                       -- full normalized detail (advocates, acts, sections, registration, judges)
alter table matter add column if not exists party_names    text[] not null default '{}';
alter table matter add column if not exists advocate_names text[] not null default '{}';
alter table matter add column if not exists judge_names    text[] not null default '{}';
alter table matter add column if not exists act_names      text[] not null default '{}';
create index if not exists matter_party_names_idx    on matter using gin (party_names);
create index if not exists matter_advocate_names_idx on matter using gin (advocate_names);
create index if not exists matter_judge_names_idx    on matter using gin (judge_names);
create index if not exists matter_act_names_idx      on matter using gin (act_names);

create table if not exists court_order (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant (id) on delete cascade,
  matter_id   uuid not null references matter (id) on delete cascade,
  order_date  date,
  title       text,
  url         text,
  text_ref    text,                          -- parsed order text when available
  raw         jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists court_order_matter_idx on court_order (matter_id);
create unique index if not exists court_order_dedup_idx
  on court_order (matter_id, coalesce(order_date, '1900-01-01'::date), coalesce(title,''));

-- ── E2 · document dedup ────────────────────────────────────────────────────
alter table document add column if not exists content_hash text;
create index if not exists document_content_hash_idx on document (tenant_id, content_hash);

-- ── E3 · saved views ───────────────────────────────────────────────────────
create table if not exists saved_view (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete set null,
  kind        text not null default 'cases',
  name        text not null,
  query       jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists saved_view_tenant_idx on saved_view (tenant_id, kind);

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Tenant-owned tables: the standard 4 policies keyed to current_tenant_id().
do $$
declare t text;
begin
  foreach t in array array['court_refresh_request','court_order','saved_view'] loop
    execute format('alter table %I enable row level security;', t);
    if not exists (select 1 from pg_policies where tablename=t and policyname=t||'_select') then
      execute format('create policy %1$s_select on %1$I for select using (tenant_id = current_tenant_id());', t);
      execute format('create policy %1$s_insert on %1$I for insert with check (tenant_id = current_tenant_id());', t);
      execute format('create policy %1$s_update on %1$I for update using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());', t);
      execute format('create policy %1$s_delete on %1$I for delete using (tenant_id = current_tenant_id());', t);
    end if;
  end loop;
end $$;

-- Shared/global gateway tables: RLS on, NO policies → only the service-role reaches them.
alter table court_cache           enable row level security;
alter table court_provider_health enable row level security;
