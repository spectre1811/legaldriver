-- Phase 3 · 0012 — keyless upgrades
--   (a) Semantic retrieval: pgvector + document_chunk.embedding + a tenant-scoped
--       match function. Embeddings are produced locally on the worker (bge-small via
--       transformers.js) — no API key. FTS still works; this adds semantic recall.
--   (b) Practice areas: seed sensible Indian defaults for every tenant (the intake
--       dropdown was empty) and seed them for new tenants in handle_new_user.

-- ── (a) pgvector + embeddings ────────────────────────────────────────────────
create extension if not exists vector;

-- bge-small-en-v1.5 / all-MiniLM-L6-v2 are 384-dim. Nullable: backfilled by the worker.
alter table document_chunk add column if not exists embedding vector(384);
create index if not exists document_chunk_embedding_idx
  on document_chunk using hnsw (embedding vector_cosine_ops);

-- Tenant-scoped nearest-neighbour search. p_embedding is the query vector as a
-- pgvector text literal ('[..]'); we cast inside so PostgREST can pass it as text.
create or replace function match_document_chunks(p_tenant uuid, p_embedding text, p_k int default 6)
returns table (document_id uuid, matter_id uuid, content text, similarity float)
language sql stable
set search_path = public as $$
  select dc.document_id, dc.matter_id, dc.content, 1 - (dc.embedding <=> p_embedding::vector) as similarity
  from document_chunk dc
  where dc.tenant_id = p_tenant and dc.embedding is not null
  order by dc.embedding <=> p_embedding::vector
  limit greatest(1, least(p_k, 20));
$$;

-- ── (b) Practice-area defaults ───────────────────────────────────────────────
-- Seed defaults for every existing tenant that has none (skip dupes by name).
insert into practice_area (tenant_id, name)
select t.id, pa.name
from tenant t
cross join (values
  ('Civil Litigation'), ('Criminal'), ('Family & Matrimonial'),
  ('Property & Real Estate'), ('Corporate & Commercial'), ('Cheque Bounce (NI Act 138)'),
  ('Arbitration'), ('Consumer'), ('Labour & Employment'),
  ('Intellectual Property'), ('Taxation'), ('Writ & Constitutional')
) as pa(name)
where not exists (
  select 1 from practice_area p where p.tenant_id = t.id and lower(p.name) = lower(pa.name)
);

-- Seed the same defaults whenever a new tenant is bootstrapped.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public as $function$
declare new_tenant_id uuid;
begin
  if coalesce(new.raw_user_meta_data->>'is_portal','') = 'true' then
    return new; -- portal users are linked via portal_user, not profile
  end if;
  insert into tenant (name)
    values (coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)) || '''s workspace')
    returning id into new_tenant_id;
  insert into profile (id, tenant_id, full_name, role)
    values (new.id, new_tenant_id, new.raw_user_meta_data->>'full_name', 'owner');
  insert into practice_area (tenant_id, name)
    select new_tenant_id, name from (values
      ('Civil Litigation'), ('Criminal'), ('Family & Matrimonial'),
      ('Property & Real Estate'), ('Corporate & Commercial'), ('Cheque Bounce (NI Act 138)'),
      ('Arbitration'), ('Consumer'), ('Labour & Employment'),
      ('Intellectual Property'), ('Taxation'), ('Writ & Constitutional')
    ) as pa(name);
  return new;
end $function$;
