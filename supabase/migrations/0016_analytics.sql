-- Phase 3 · 0016 — analytics summary RPC.
-- One round-trip that returns every headline number for the caller's tenant.
-- SECURITY DEFINER so it can also surface shared-infra counts (court_cache cache
-- size, global law-pack size) that normal RLS hides — but EVERY tenant-owned
-- subquery is explicitly filtered by current_tenant_id(), so nothing leaks across
-- tenants. Money is paise (minor units); rate_minor is per hour.
create or replace function analytics_summary()
returns jsonb
language sql
stable
security definer
set search_path = public as $$
  select jsonb_build_object(
    'cases_total',            (select count(*) from matter where tenant_id = current_tenant_id()),
    'cases_active',           (select count(*) from matter where tenant_id = current_tenant_id() and coalesce(status,'active') = 'active'),
    'cases_by_stage',         (select coalesce(jsonb_object_agg(k, c), '{}') from (select coalesce(stage,'—') k, count(*) c from matter where tenant_id = current_tenant_id() group by 1 order by c desc limit 8) s),
    'cases_by_court',         (select coalesce(jsonb_object_agg(k, c), '{}') from (select coalesce(court,'—') k, count(*) c from matter where tenant_id = current_tenant_id() group by 1 order by c desc limit 8) s),
    'hearings_7d',            (select count(*) from hearing where tenant_id = current_tenant_id() and date >= current_date and date < current_date + 7),
    'hearings_30d',           (select count(*) from hearing where tenant_id = current_tenant_id() and date >= current_date and date < current_date + 30),
    'deadlines_open',         (select count(*) from deadline where tenant_id = current_tenant_id() and status = 'open'),
    'deadlines_overdue',      (select count(*) from deadline where tenant_id = current_tenant_id() and status = 'open' and due_date < current_date),
    'clients_total',          (select count(*) from client where tenant_id = current_tenant_id()),
    'documents_total',        (select count(*) from document where tenant_id = current_tenant_id()),
    'documents_unfiled',      (select count(*) from document where tenant_id = current_tenant_id() and client_id is null and matter_id is null),
    'storage_bytes',          (select coalesce(sum(size_bytes),0) from document where tenant_id = current_tenant_id()),
    'time_minutes',           (select coalesce(sum(minutes),0) from time_entry where tenant_id = current_tenant_id()),
    'time_billable_minutes',  (select coalesce(sum(minutes),0) from time_entry where tenant_id = current_tenant_id() and billable),
    'unbilled_minor',         (select coalesce(sum((minutes * rate_minor) / 60.0),0)::bigint from time_entry where tenant_id = current_tenant_id() and billable and invoiced_invoice_id is null),
    'expense_minor',          (select coalesce(sum(amount_minor),0) from expense where tenant_id = current_tenant_id()),
    'expense_unbilled_minor', (select coalesce(sum(amount_minor),0) from expense where tenant_id = current_tenant_id() and billable and invoiced_invoice_id is null),
    'emails_total',           (select count(*) from email_message where tenant_id = current_tenant_id()),
    'hearings_total',         (select count(*) from hearing where tenant_id = current_tenant_id()),
    'orders_total',           (select count(*) from court_order where tenant_id = current_tenant_id()),
    'chunks_total',           (select count(*) from document_chunk where tenant_id = current_tenant_id()),
    'messages_total',         (select count(*) from msg_message where tenant_id = current_tenant_id()),
    'voice_total',            (select count(*) from voice_recording where tenant_id = current_tenant_id()),
    'deadline_rules',         (select count(*) from deadline_rule where tenant_id = current_tenant_id()),
    'ip_total',               (select count(*) from ip_asset where tenant_id = current_tenant_id()),
    'law_pack',               (select count(*) from legal_reference),
    'cached_cases',           (select count(*) from court_cache where kind = 'case')
  );
$$;

grant execute on function analytics_summary() to authenticated;
