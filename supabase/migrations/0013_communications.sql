-- Phase 3 · 0013 — unified communications + AI suggested replies (E1)
--   (a) communication_log: a VIEW unioning inbound Gmail (email_message) and
--       WhatsApp/SMS (msg_message) into one per-matter/per-client timeline.
--       Created WITH (security_invoker = true) so it runs under the QUERYING
--       user's RLS — a default view runs as its definer and would leak across
--       tenants. This is the load-bearing isolation guarantee for the view.
--   (b) msg_message.suggested_reply: the AI-drafted reply for an inbound message.
--       AI never auto-sends (project hard line); the advocate reviews + sends.

alter table msg_message add column if not exists suggested_reply text;

create or replace view communication_log
with (security_invoker = true) as
  select
    e.id,
    'email'::text       as channel,
    'in'::text          as direction,
    e.tenant_id,
    e.from_addr         as counterparty,
    e.subject           as subject,
    e.snippet           as preview,
    e.classified_client_id as client_id,
    e.classified_matter_id as matter_id,
    e.received_at       as occurred_at,
    e.status            as status
  from email_message e
  union all
  select
    m.id,
    m.channel,
    m.direction,
    m.tenant_id,
    case when m.direction = 'in' then m.from_addr else m.to_addr end as counterparty,
    null::text          as subject,
    m.body              as preview,
    m.client_id,
    m.matter_id,
    m.created_at        as occurred_at,
    m.status
  from msg_message m;

-- The view enforces RLS via security_invoker; grant table-level SELECT so the
-- API roles can reach it (underlying RLS still restricts rows to the tenant).
grant select on communication_log to authenticated;
