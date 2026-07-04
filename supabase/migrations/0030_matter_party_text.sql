-- WO-35 #5 · substring party search (FOUNDER-GATED — apply before setting COURT_PARTY_TEXT_SEARCH=1).
--
-- Problem: matter.party_names is text[], so the cases-list filter uses array-CONTAINS (exact element
-- match) — a partial party name ("Sharm") returns nothing. Denormalize a lowercased party_text and
-- add a trigram index so we can ILIKE-substring-search it. A trigger keeps party_text in sync with
-- party_names, so app code needs no population change (upsertCase already writes party_names).
--
-- Safe to run repeatedly (idempotent). The cases page only queries party_text when
-- COURT_PARTY_TEXT_SEARCH=1 is set, so deploying the app before/without this migration is harmless.

create extension if not exists pg_trgm;

alter table matter add column if not exists party_text text;

-- Backfill existing rows.
update matter
  set party_text = lower(array_to_string(party_names, ' '))
  where party_names is not null and party_text is null;

-- Keep party_text in lockstep with party_names on write.
create or replace function matter_party_text_sync() returns trigger
  language plpgsql as $$
begin
  new.party_text := lower(array_to_string(coalesce(new.party_names, '{}'), ' '));
  return new;
end $$;

drop trigger if exists trg_matter_party_text on matter;
create trigger trg_matter_party_text
  before insert or update of party_names on matter
  for each row execute function matter_party_text_sync();

-- Trigram GIN index powers fast ILIKE '%term%' substring search.
create index if not exists idx_matter_party_text_trgm
  on matter using gin (party_text gin_trgm_ops);
