-- WO-43-W2 · Soft-delete for matters (reversible bulk delete + 10s undo on the senior-grade Cases list).
--
-- Adds `matter.deleted_at` and makes it the SINGLE source of truth for "is this case live?" by
-- filtering it in the RLS SELECT policies — so every RLS-scoped read (the Cases list, calendar,
-- dashboard, search, autofile, …) excludes trashed cases automatically, with no per-query filter to
-- forget. Service-role/admin reads bypass RLS and are filtered explicitly in code (cron refresh,
-- cron causelist, court capture, doc file-upload, messaging ingest).
--
-- Reversible: a trashed row keeps all its data + relations; restore is `deleted_at := null`. The
-- UPDATE/DELETE policies are intentionally NOT filtered on deleted_at, so an owner can still restore
-- (or hard-purge) a trashed row that the SELECT policy hides.

alter table matter add column if not exists deleted_at timestamptz;

-- The hot path is "live cases for this tenant"; a partial index keeps it cheap and skips trashed rows.
create index if not exists matter_live_idx on matter (tenant_id) where deleted_at is null;

-- Re-scope the tenant SELECT policy (0001) to hide trashed rows.
drop policy if exists matter_select on matter;
create policy matter_select on matter for select
  using (tenant_id = current_tenant_id() and deleted_at is null);

-- Re-scope the client-portal SELECT policy (0009) the same way — a client never sees a trashed matter.
drop policy if exists matter_portal_sel on matter;
create policy matter_portal_sel on matter for select
  using (tenant_id = portal_tenant_id() and client_id = portal_client_id() and deleted_at is null);
