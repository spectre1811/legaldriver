-- Drafting agent · P-C — the draft data model. A `draft` is a response being
-- prepared to a source document; each generate/edit appends a `draft_version`
-- (prose body + assumptions/presumptions/clarifications/bullets + citations).
-- Assistive only: status starts 'draft' (or 'pending' while the worker synthesises);
-- it is NEVER auto-sent or auto-filed — finalisation is an explicit human action.
-- See docs/decisions/2026-06-29-drafting-agent.md §5.

create table if not exists draft (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenant(id) on delete cascade,
  source_document_id uuid references document(id) on delete set null,
  matter_id          uuid references matter(id) on delete set null,
  client_id          uuid references client(id) on delete set null,
  template_id        uuid references draft_template(id) on delete set null,
  produces_doc_type  text,
  sections           text[] not null default '{}',   -- statutory sections actually drafted under
  language           text not null default 'en',
  title              text,
  status             text not null default 'draft'
                     check (status in ('pending','draft','edited','finalized','discarded')),
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists draft_tenant_idx on draft (tenant_id);
create index if not exists draft_source_idx on draft (source_document_id);
create index if not exists draft_matter_idx on draft (matter_id);

create table if not exists draft_version (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenant(id) on delete cascade,
  draft_id      uuid not null references draft(id) on delete cascade,
  version       int not null,
  body          text,                          -- the prose (markdown)
  assumptions   text[] not null default '{}',
  presumptions  text[] not null default '{}',
  clarifications text[] not null default '{}', -- open questions the advocate must answer
  bullet_points text[] not null default '{}',  -- operative points / checklist
  citations     jsonb not null default '[]',   -- [{n, source, ref, title, url}]
  generated_by  text,                          -- 'llm' | 'human-edit'
  meta          jsonb not null default '{}',   -- pending: {context/template} for the worker
  created_at    timestamptz not null default now(),
  unique (draft_id, version)
);
create index if not exists draft_version_draft_idx on draft_version (draft_id);
create index if not exists draft_version_pending_idx on draft_version (tenant_id) where (meta->>'pending') = 'true';

-- ── RLS (the standard 4 policies, keyed to current_tenant_id()) ───────────────
do $$
declare t text;
begin
  foreach t in array array['draft','draft_version'] loop
    execute format('alter table %I enable row level security;', t);
    if not exists (select 1 from pg_policies where tablename=t and policyname=t||'_select') then
      execute format('create policy %1$s_select on %1$I for select using (tenant_id = current_tenant_id());', t);
      execute format('create policy %1$s_insert on %1$I for insert with check (tenant_id = current_tenant_id());', t);
      execute format('create policy %1$s_update on %1$I for update using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());', t);
      execute format('create policy %1$s_delete on %1$I for delete using (tenant_id = current_tenant_id());', t);
    end if;
  end loop;
end $$;
