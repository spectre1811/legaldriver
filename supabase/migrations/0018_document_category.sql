-- Phase 3 · 0018 — document category (structured taxonomy).
-- Canonical category derived from doc_type (categoryOf in src/lib/docs/categories.ts),
-- so documents group/filter consistently instead of everything being "other".
alter table document add column if not exists category text;
create index if not exists document_category_idx on document (tenant_id, category);
