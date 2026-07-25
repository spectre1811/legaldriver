-- WO-272 · Invite-only auth: public account creation is closed (Supabase
-- disable_signup + UI). Interested people leave their email via /request-access;
-- the founder reviews and provisions them. This is the durable intake ledger +
-- admin workflow state.
--
-- NOT tenant-owned: an access request exists BEFORE any tenant/account, so it
-- carries no tenant column and does NOT use the per-tenant RLS policy family.
-- Instead: RLS is ENABLED with NO anon/authenticated policies -> deny-all for
-- the public/anon and logged-in clients. Only the service-role key (admin.ts,
-- server-only) can read/write it, which it does bypassing RLS. So the public
-- form's server action writes via the admin client; nobody can read or write
-- this table directly from the browser.

create table if not exists access_requests (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,                       -- normalized lower/trim in the action
  name        text,
  note        text,
  status      text not null default 'new',         -- 'new' | 'provisioned' | 'rejected'
  source      text not null default 'login',       -- where the request came from
  created_at  timestamptz not null default now(),
  handled_at  timestamptz,                          -- when an admin acted (W2)
  handled_by  uuid                                  -- admin user id who acted (W2)
);

-- Admin list is "newest new requests first"; recent-by-email drives the 10-min
-- notification dedupe in the action.
create index if not exists access_requests_status_created_idx on access_requests (status, created_at desc);
create index if not exists access_requests_email_created_idx on access_requests (lower(email), created_at desc);

-- Deny-by-default: enable RLS, add NO policies. anon/authenticated get nothing;
-- the service-role (server-only) bypasses RLS for the intake + admin workflow.
alter table access_requests enable row level security;
