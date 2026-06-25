-- Solid document browsing: size metadata + full-text search over filename + parsed_text.
alter table document add column if not exists size_bytes bigint;

alter table document add column if not exists fts tsvector
  generated always as (
    to_tsvector('english', coalesce(filename,'') || ' ' || coalesce(doc_type,'') || ' ' || coalesce(parsed_text,''))
  ) stored;

create index if not exists document_fts_idx on document using gin (fts);
create index if not exists document_matter_idx on document (matter_id);
create index if not exists document_client_idx on document (client_id);
