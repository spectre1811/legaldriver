-- WO-29 W3 · include email_subject in the document full-text index so an email-sourced doc is
-- findable by its email's subject via the existing documents search (textSearch on `fts`). A
-- generated column can't be altered in place → drop + recreate (mirrors 0014); GIN index rebuilt.
drop index if exists document_fts_idx;
alter table document drop column if exists fts;
alter table document add column fts tsvector generated always as (
  to_tsvector(
    'english',
    regexp_replace(coalesce(filename, ''), '[._/-]+', ' ', 'g') || ' ' ||
    coalesce(doc_type, '') || ' ' ||
    coalesce(email_subject, '') || ' ' ||
    coalesce(parsed_text, '')
  )
) stored;
create index document_fts_idx on document using gin (fts);
