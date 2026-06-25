-- Phase 3 · 0017 — human-in-the-loop court capture token.
-- The advocate (a human) logs into the official eCourts portal and solves the CAPTCHA
-- themselves, opens a case, and clicks our bookmarklet — which POSTs the rendered page
-- to /api/court/capture authenticated by this per-tenant token. We never automate or
-- bypass the CAPTCHA; we only parse what the human brought back.
create table if not exists capture_token (
  token        uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenant (id) on delete cascade,
  created_by   uuid references auth.users (id) on delete set null,
  label        text,
  revoked      boolean not null default false,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists capture_token_tenant_idx on capture_token (tenant_id);

do $$ begin
  execute 'alter table capture_token enable row level security';
  if not exists (select 1 from pg_policies where tablename='capture_token' and policyname='capture_token_select') then
    create policy capture_token_select on capture_token for select using (tenant_id = current_tenant_id());
    create policy capture_token_insert on capture_token for insert with check (tenant_id = current_tenant_id());
    create policy capture_token_update on capture_token for update using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
    create policy capture_token_delete on capture_token for delete using (tenant_id = current_tenant_id());
  end if;
end $$;
