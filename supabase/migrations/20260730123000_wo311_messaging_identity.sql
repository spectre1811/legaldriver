-- WO-311 · Inbound messaging webhooks must resolve a real tenant or fail closed.
-- INERT on merge — the founder applies this (OPERATING §6: migrations are
-- always-high). The runtime code is fail-soft against the pre-apply schema: a
-- missing table makes the lookup MISS, and a miss is already the fail-closed
-- path (no tenant row written, an unrouted record + a GChat alert instead). So
-- merge order is safe either way — the only pre-apply symptom is that inbound
-- messages are REJECTED rather than misfiled, which is the intended direction.
--
-- The defect this closes: `resolveTenant()` in the WhatsApp webhook used to
-- return MESSAGING_DEFAULT_TENANT_ID, else "the sole tenant row", else null.
-- Safe only while exactly one tenant exists — the day firm #2 onboards, every
-- firm's inbound client messages land in whichever tenant the env var names.
-- No attacker required (tenancy audit 2026-07-30 §3 row 1).
--
-- The mapping is on the RECEIVING identity (the number the message arrived ON),
-- never the sender: for WhatsApp that is Meta's stable `phone_number_id` from
-- `entry[].changes[].value.metadata`; for telephony it is the dialed DID in
-- E.164. The sender is a client's personal number and is caller-controlled — it
-- can never be a routing key.

create table if not exists messaging_identity (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant (id) on delete cascade,
  channel     text not null check (channel in ('whatsapp', 'telephony')),
  identity    text not null,                       -- WABA phone_number_id | DID in E.164
  label       text,                                -- human note ("Mukadma main WABA")
  active      boolean not null default true,       -- deactivate = fail closed again, no delete
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ONE tenant per receiving identity, enforced by the database rather than by
-- webhook code. Channel-qualified because a DID and a phone_number_id are
-- different namespaces that could collide as bare strings.
create unique index if not exists messaging_identity_channel_identity_key
  on messaging_identity (channel, identity);

-- Per-tenant listing (onboarding/diagnostics) without scanning the table.
create index if not exists messaging_identity_tenant_idx
  on messaging_identity (tenant_id, channel);

-- RLS posture — deliberate, and NOT the standard 4-policy family:
--   * SELECT for the owning tenant only. The row holds the firm's OWN business
--     number; letting the firm see it is harmless, and it keeps the table inside
--     the fleet's automated isolation proof (WO-310's rls_isolation enumerates
--     tenant-scoped tables from the migrations, so this one gets probed the
--     moment it lands — a deny-all table would be invisible to that proof).
--   * NO insert/update/delete policies (deny-by-default). Provisioning is a
--     service-role act during onboarding. A tenant-writable mapping would be a
--     routing-hijack primitive: tenant A could claim an identity that tenant B
--     is about to onboard, and every one of B's client messages would file to
--     A. The unique index alone does not prevent that — only the absence of a
--     write policy does.
-- Webhooks are unauthenticated and run under the service role (admin.ts), which
-- bypasses RLS entirely; they scope by tenant_id by hand, as everywhere else.
do $$
declare t text := 'messaging_identity';
begin
  execute format('alter table %I enable row level security;', t);
  if not exists (select 1 from pg_policies where tablename = t and policyname = t || '_select') then
    execute format('create policy %1$s_select on %1$I for select using (tenant_id = current_tenant_id());', t);
    -- no _insert / _update / _delete policy: service-role provisioning only.
  end if;
end $$;
