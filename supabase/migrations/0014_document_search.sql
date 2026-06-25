-- Phase 3 · 0014 — fix document search.
-- Problem: filenames like "demand_notice_v2.pdf" tokenise as ONE token, so a search
-- for "demand notice" never matches the file. Redefine the generated fts column to
-- split separators (._/-) before tokenising, so filename words, doc_type, and parsed
-- text are all searchable. (A generated column can't be altered in place — drop +
-- recreate; the GIN index is recreated too.)

drop index if exists document_fts_idx;
alter table document drop column if exists fts;
alter table document add column fts tsvector generated always as (
  to_tsvector(
    'english',
    regexp_replace(coalesce(filename, ''), '[._/-]+', ' ', 'g') || ' ' ||
    coalesce(doc_type, '') || ' ' ||
    coalesce(parsed_text, '')
  )
) stored;
create index document_fts_idx on document using gin (fts);
