-- Phase 3 · 0019 — court-data CORPUS (compliant, large-scale, own datastore).
-- Source: AWS Open Data "Indian High Court Judgments" (CC-BY-4.0, no auth, no CAPTCHA)
-- — we consume the PUBLISHED OPEN MIRROR, never the upstream scraper. Non-PII public
-- court record. Stored in Postgres (per the storage decision doc) as public-read
-- reference data; writes are service-role only. Idempotent on pdf_link.
create extension if not exists pg_trgm;

create table if not exists corpus_judgment (
  id                uuid primary key default gen_random_uuid(),
  source            text not null default 'aws-ihcj',
  license           text not null default 'CC-BY-4.0',
  state             text default 'Gujarat',
  court_code        text,
  court             text,
  cnr               text,
  case_number       text,
  title             text,
  petitioner        text,
  respondent        text,
  judge             text,
  year              int,
  registration_date date,
  decision_date     date,
  disposal_nature   text,
  pdf_link          text,            -- relative path in the open bucket
  content_hash      text,
  ingested_at       timestamptz not null default now(),
  fts tsvector generated always as (
    to_tsvector('english', coalesce(title,'') || ' ' || coalesce(petitioner,'') || ' ' || coalesce(respondent,'') || ' ' || coalesce(judge,''))
  ) stored
);
create unique index if not exists corpus_judgment_pdf_uq on corpus_judgment (pdf_link);
create index if not exists corpus_judgment_cnr_idx on corpus_judgment (cnr);
create index if not exists corpus_judgment_decision_idx on corpus_judgment (decision_date);
create index if not exists corpus_judgment_year_idx on corpus_judgment (year);
create index if not exists corpus_judgment_fts_idx on corpus_judgment using gin (fts);
create index if not exists corpus_judgment_pet_trgm on corpus_judgment using gin (petitioner gin_trgm_ops);
create index if not exists corpus_judgment_res_trgm on corpus_judgment using gin (respondent gin_trgm_ops);
create index if not exists corpus_judgment_judge_trgm on corpus_judgment using gin (judge gin_trgm_ops);

-- Provenance + incremental bookkeeping.
create table if not exists corpus_source_batch (
  id            uuid primary key default gen_random_uuid(),
  source        text not null,
  partition     text,           -- e.g. year=2023/court=24_17/bench=gujarathc
  rows_seen     int,
  rows_upserted int,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  note          text
);
create table if not exists corpus_ingest_watermark (
  source           text not null,
  partition        text not null,
  last_ingested_at timestamptz,
  rows             int,
  primary key (source, partition)
);

-- RLS: judgments are public CC-BY court record → world-readable; writes service-role only.
alter table corpus_judgment enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='corpus_judgment' and policyname='corpus_judgment_read') then
    create policy corpus_judgment_read on corpus_judgment for select using (true);
  end if;
end $$;
alter table corpus_source_batch enable row level security;     -- no policy → service-role only
alter table corpus_ingest_watermark enable row level security; -- no policy → service-role only
