# Storage for the large Gujarat court-data corpus

**Date:** 2026-06-28 · **Status:** accepted (design)
**Builds on:** `2026-06-24-court-data-strategy.md` (no scrape / no CAPTCHA, own datastore),
`2026-06-25-court-data-sourcing.md` (where the data legitimately comes from), `0001_init.sql`
(live tenant schema), `0015_reference_spine.sql` (reference spine).

## What this decides

Where to store a **large, mostly-public, analytical** Gujarat court-data corpus — millions of
case + cause-list + judgment records, a historical bulk load plus **daily incremental growth**.
This is the shared "what does the world's court data look like" store the app **reads from**. It
is explicitly **not** the per-tenant live store: tenant matters, deadlines, notices, documents
stay in Supabase under RLS (`matter`, `hearing`, `cause_list_entry`, …). The corpus is a
reference layer those tenant rows *link to* (by CNR) and *enrich from*.

The operator suspects MongoDB. This doc evaluates it honestly. Spoiler: **MongoDB is a
reasonable fit and loses to Postgres mainly on integration, not on capability** — and integration
is the dominant cost for *this* app.

---

## 1. The workload, stated precisely

| Dimension | This corpus |
|---|---|
| Scale | Tens of millions of rows now (DevDataLab ≈ 81M districts 2010–18; e-SCR ≈ 35k SC judgments; Gujarat slice = millions), growing daily |
| Write shape | One big historical bulk load, then **idempotent daily upserts** keyed on CNR |
| Mutation | Mostly append; a case's **status/next-hearing changes over time** → needs change-history |
| Read: point | Lookup by **CNR** / case-number (exact, the hot path) |
| Read: temporal | **Cause-list-by-date** (give me all items listed on 2026-06-29 in court X) |
| Read: fuzzy | **Party / advocate / judge name search** (typos, transliteration, initials) |
| Read: analytics | Aggregates — pendency by court/act/year, disposal times, judge/advocate stats |
| Read: semantic | **Similarity / semantic search** over judgment text ("cases like this") |
| Tenancy | **Not** tenant-owned. Public-derived, single shared copy, read-mostly. No RLS needed (a thin allow-read-deny-write posture instead). |
| Provenance | Mandatory: `source` + `last_synced_at` + version trail per the brief |

The decisive fact: this app is **already a Supabase/Postgres app** with pg_trgm, FTS, pgvector,
JSONB, partitioning and a generated `database.types.ts` as the single source of DB types. Any
second datastore is a second set of clients, types, backups, auth, ops, and a join boundary the
app has to cross in application code.

---

## 2. Candidates

- **A. Postgres / Supabase** (one DB, same project) — JSONB for raw payloads, normalized columns
  + GIN/`pg_trgm` for name search, `tsvector` FTS, `pgvector` for semantic, declarative range
  partitioning for the big tables, `INSERT … ON CONFLICT` for idempotent upserts.
- **B. MongoDB** (Atlas) — document collections, flexible schema for heterogeneous court payloads,
  Atlas Search (Lucene) for text, Atlas Vector Search for semantic, `updateOne(upsert:true)` on a
  natural-key index.
- **C. Hybrid** — Supabase as the **system of record + serving store**; an **analytical sidecar**
  (DuckDB/Parquet or ClickHouse) for heavy aggregates; optionally **OpenSearch** if name/full-text
  search outgrows Postgres. Each added only when a measured limit is hit.

Sub-options noted, not standalone recommendations: **ClickHouse/DuckDB+Parquet** (superb for the
analytics column, poor for point-lookup/upsert/serving), **OpenSearch/Elasticsearch** (superb for
fuzzy+full-text+faceting, another cluster to run, not a system of record).

---

## 3. Comparison matrix

Scored for **this** workload (✅ strong · 🟢 adequate · ⚠️ weak). "Hybrid" = the part that does it.

| Criterion | Postgres/Supabase | MongoDB (Atlas) | Hybrid (PG + sidecar) |
|---|---|---|---|
| Bulk historical load (10s of M) | ✅ `COPY`, very fast | ✅ `mongoimport`/bulk | ✅ (Parquet→PG/CH) |
| Idempotent daily upsert on CNR | ✅ `ON CONFLICT (cnr) DO UPDATE` | ✅ `upsert` on unique idx | ✅ (PG path) |
| Schema flexibility (messy court JSON) | 🟢 JSONB columns | ✅ native, best-in-class | 🟢 JSONB |
| CNR / case-number point lookup | ✅ B-tree, instant | ✅ indexed, instant | ✅ |
| Cause-list-by-date | ✅ partition + B-tree | ✅ compound index | ✅ |
| Party/advocate fuzzy name search | ✅ `pg_trgm` GIN (good) | ✅ Atlas Search (better OOTB) | ✅ (OpenSearch if needed) |
| Analytics aggregates at scale | 🟢 OK to ~10s M; tune | 🟢 aggregation pipeline OK | ✅ ClickHouse/DuckDB excels |
| Similarity / semantic search | ✅ `pgvector` (HNSW) | ✅ Atlas Vector Search | ✅ pgvector |
| Change-history / versioning | ✅ append event table + triggers | 🟢 manual versioning | ✅ |
| Entity resolution / dedup | ✅ SQL joins + `pg_trgm` + fuzzystrmatch | ⚠️ joins via `$lookup`, weaker | ✅ |
| Cross-store joins with tenant data | ✅ **same DB, real FK/joins** | ⚠️ **app-side join across two DBs** | ✅ (PG side) |
| Integration w/ existing app | ✅ zero new client/types/auth | ⚠️ new driver, types, secrets, backups | 🟢 mostly PG, one sidecar |
| Ops simplicity | ✅ one managed service | ⚠️ second managed service | ⚠️ most moving parts |
| Cost at this scale | ✅ one bill; scale instance | 🟢 Atlas tier; second bill | ⚠️ two/three bills |
| Single source of DB types | ✅ `database.types.ts` covers it | ⚠️ types live outside the generator | 🟢 PG covered |

**Where MongoDB genuinely wins:** (1) ingesting **heterogeneous, evolving raw payloads** — every
court/provider returns a slightly different shape and Mongo never makes you migrate; (2) **Atlas
Search** is a more capable text engine out of the box than `pg_trgm`+`tsvector` (better fuzzy,
synonyms, faceting) without bolting on OpenSearch; (3) horizontal **sharding** is first-class if
this ever reaches hundreds of millions of rows across all of India.

**Where MongoDB loses for THIS app:** (1) the corpus is read by an app whose entire other half is
relational and RLS-scoped — every "show this judgment next to the tenant's matter" becomes a
**cross-database join in application code** instead of a SQL join; (2) **entity resolution /
dedup** (parties↔advocates↔judges↔courts↔acts) is inherently relational and far cleaner with SQL
joins + `pg_trgm`/`fuzzystrmatch` than with `$lookup`; (3) it adds a **second datastore** — new
driver, second secrets set, second backup/restore story, types that fall outside the
`database.types.ts` generator, and a new failure mode — for capabilities Postgres already covers
adequately; (4) Postgres covers JSONB-flexibility, vector, FTS and aggregates *well enough* at
tens of millions of rows, so Mongo's wins don't clear the bar that justifies a second system.

---

## 4. Recommendation

**Store the corpus in Postgres, in the same Supabase project, in a dedicated `corpus` schema —
NOT MongoDB.** Keep a documented **escape hatch to the Hybrid** (add ClickHouse/DuckDB for
analytics, or OpenSearch for search) *only when a measured limit is hit*, never preemptively.

Rationale, in priority order:

1. **Integration dominates.** The corpus exists to be read *next to* tenant matters. One DB means
   real joins (`matter.cnr → corpus.case.cnr`), one client, one types file, one backup, one bill.
   A second datastore taxes every feature that spans both halves, forever. This is the deciding
   factor and it points squarely at Postgres.
2. **Postgres is capable enough here.** JSONB absorbs messy court payloads; `pg_trgm` does fuzzy
   name search; `tsvector` does full-text; `pgvector` (HNSW) does semantic; declarative
   partitioning + `ON CONFLICT` handle the scale and the daily idempotent upsert. Tens of millions
   of rows is comfortable territory for a tuned Postgres instance.
3. **Entity resolution wants SQL.** Linking parties/advocates/judges/courts/acts is a join +
   fuzzy-match problem — Postgres's home turf, Mongo's weak spot.
4. **One ops surface, one mental model.** The team already runs Supabase, writes SQL, and
   regenerates `database.types.ts`. No new driver, secret, or backup pipeline.
5. **No premature distribution.** MongoDB's standout win (sharding to hundreds of millions across
   all-India) is a problem we don't have at Gujarat scale; buying it now is paying ops cost for
   capacity we won't use. If we ever reach it, the **analytics/search sidecar (Hybrid)** is the
   cheaper next step than re-platforming the system of record to Mongo.

**Honest counter-case (when to revisit MongoDB):** if the corpus stops being read alongside
relational tenant data and becomes a *standalone* document/search service, **and** payload shapes
churn so hard that JSONB-on-Postgres becomes painful, **and** Atlas Search's out-of-the-box text
quality becomes a product differentiator — then a Mongo (or OpenSearch) document store earns its
keep. None of those hold today.

**Isolation note:** put the corpus in its own `corpus` schema (not `public`) so it's clearly the
shared/public layer, can have a coarse "authenticated may read, only service-role writes" policy
instead of per-tenant RLS, and can later be split to its own Postgres instance with minimal app
change (the access path is already a separate schema behind the `CourtDataClient`/own-store
adapter).

---

## 5. Schema design (`corpus` schema)

Normalized **canonical entities** + **resolution/link tables** + an **append-only change log** +
**raw payload preservation**. Conventions match the existing app: CNR canonical key, JSONB for raw,
GIN/`pg_trgm` for names, `tsvector` FTS, `pgvector` for semantics, `source`+`last_synced_at`
provenance on every row.

### 5.1 Canonical entities

```
corpus.court
  id              uuid pk
  court_code      text unique         -- NIC court establishment code (natural key)
  name            text
  level           text                -- 'SC' | 'HC' | 'district' | 'taluka' | 'tribunal'
  state_code      text                -- '24' = Gujarat
  district        text
  parent_court_id uuid -> corpus.court(id)   -- hierarchy
  meta            jsonb
  source, last_synced_at

corpus.case                              -- the spine; one row per CNR (partition by state/year)
  cnr             text                   -- 16-char CNR = NATURAL KEY
  court_id        uuid -> corpus.court(id)
  case_number     text                   -- registration no (type/number/year)
  case_type       text
  filing_year     int
  title           text
  stage           text
  status          text                   -- current snapshot (history in change_event)
  next_hearing_date date
  disposal_date   date
  -- denormalized facet arrays for fast overlap search (mirrors app's matter facets)
  party_names     text[]                 -- GIN
  advocate_names  text[]                 -- GIN
  judge_names     text[]                 -- GIN
  act_names       text[]                 -- GIN
  detail          jsonb                  -- normalized registration/filing metadata
  content_hash    text                   -- hash of normalized payload → change detection
  fts             tsvector generated     -- title + parties for full-text
  source, first_seen_at, last_synced_at
  PRIMARY KEY (cnr)                       -- (composite with partition key, see §5.4)

corpus.hearing                            -- many per case (partition by hearing year)
  id, case_cnr -> corpus.case(cnr), hearing_date date, purpose, court_no,
  judge, raw jsonb, content_hash, source, last_synced_at
  UNIQUE (case_cnr, hearing_date, purpose)

corpus.cause_list_entry                   -- daily cause lists (partition by list_date month)
  id, list_date date, court_id, item_no, case_cnr -> corpus.case(cnr),
  bench, raw jsonb, content_hash, source, last_synced_at
  UNIQUE (court_id, list_date, item_no)

corpus.judgment                           -- e-SCR / Indian Kanoon documents
  id, case_cnr (nullable), court_id, judgment_date, neutral_citation text,
  title, doc_url, full_text text, fts tsvector generated,
  embedding vector(1024),               -- pgvector HNSW for semantic / "cases like this"
  meta jsonb, source, license, last_synced_at
  UNIQUE (neutral_citation)  where neutral_citation is not null
```

### 5.2 Resolution / entity-resolution tables

Parties, advocates, judges, acts are **shared dimensions** that recur across cases — model them
as canonical entities with link tables so dedup/ER is a join, not a string scan.

```
corpus.person          id, kind ('advocate'|'judge'|'party'), canonical_name,
                       name_norm text,            -- folded/transliterated for matching
                       bar_number text,           -- advocates; strong dedup key
                       name_trgm via pg_trgm GIN, meta jsonb, source

corpus.act             id, short_name ('NI Act'), section ('138'),
                       canonical_ref ('NI Act s.138'), unique(canonical_ref)

corpus.case_party      case_cnr, person_id, side ('petitioner'|'respondent'|'other'),
                       advocate_person_id (nullable), PRIMARY KEY(case_cnr, person_id, side)
corpus.case_judge      case_cnr, person_id, PRIMARY KEY(case_cnr, person_id)
corpus.case_act        case_cnr, act_id,    PRIMARY KEY(case_cnr, act_id)
```

**Entity resolution** (deterministic code, Claude assists — per CLAUDE.md rule 5):
- **Strong keys first:** advocate `bar_number`, act `canonical_ref`, court `court_code`, case `cnr`.
- **Fuzzy fallback:** `name_norm` exact, then `pg_trgm` similarity + `fuzzystrmatch` (Levenshtein /
  Indian-transliteration-aware folding) over candidates in the **same court** to bound the search.
- **Confidence gate:** high-confidence → auto-merge into canonical `person`; low → a
  `corpus.merge_review` queue (mirrors the app's `needs_review` pattern). Never auto-delete.
- The denormalized `party_names/advocate_names/judge_names/act_names` arrays on `corpus.case` stay
  as a **fast read cache** (drives the same overlap-probe similarity search as `src/lib/court/similar.ts`),
  rebuilt from the link tables — the link tables are the truth.

### 5.3 Provenance + change-history (versioning without bloat)

```
corpus.source_batch    id, source, kind ('bulk'|'daily'|'hitl'|'paid_api'),
                       fetched_at, watermark text, row_count, notes jsonb
corpus.change_event    id bigserial, entity_type ('case'|'hearing'|'cause_list'),
                       entity_key text (cnr/…), batch_id -> source_batch(id),
                       changed_at timestamptz, change_kind ('insert'|'update'),
                       diff jsonb,              -- ONLY changed fields {field:{old,new}}
                       prev_content_hash, new_content_hash
                       (partition by month; cheap to archive/expire)
```

**No-bloat versioning strategy:**
- Live tables hold the **current snapshot only** (one row per CNR). No full-row copies per day.
- A row carries a `content_hash` of its normalized payload. On each upsert, compare incoming hash
  to stored hash:
  - **unchanged** → touch `last_synced_at` only (no `change_event`, no history row). This is the
    common daily case and keeps the log tiny.
  - **changed** → write the new snapshot **and** one `change_event` row containing only the
    **field-level diff** (e.g. `{status:{old:'pending',new:'disposed'}}`), not the whole record.
- `change_event` is **append-only, partitioned by month**, so the history grows linearly with
  *actual* changes (not with daily volume) and old partitions can be detached/archived to cold
  storage. Full audit ("how did this case's status evolve?") = replay diffs for that CNR.

### 5.4 Partitioning & indexes (the scale levers)

- `corpus.case` — **partition by `state_code` then RANGE on `filing_year`** (Gujarat first; other
  states added as partitions). Keeps the hot Gujarat data and recent years tight.
- `corpus.hearing` — **RANGE partition by hearing-year**; `corpus.cause_list_entry` — **RANGE by
  `list_date` (monthly)** so "cause-list-by-date" hits one small partition.
- `corpus.change_event` — **monthly partitions**, archivable.
- Indexes: B-tree `case(cnr)` (PK, point lookup); B-tree `case(court_id, next_hearing_date)`;
  GIN on the four facet arrays; `pg_trgm` GIN on `person.name_norm`; `tsvector` GIN on
  `case.fts` and `judgment.fts`; **HNSW** on `judgment.embedding`; B-tree
  `cause_list_entry(court_id, list_date)` and `hearing(case_cnr, hearing_date)`.

### 5.5 How tenant data links to the corpus

No new RLS gymnastics. `matter.cnr` already exists (`0001_init.sql`). The owned-store
`CourtDataClient` adapter reads `corpus.case`/`hearing`/`cause_list_entry` by CNR and maps to the
existing `Normalized*` types in `src/lib/court/types.ts`. Tenant writes never touch `corpus`;
corpus writes are **service-role only** (admin client), filtered explicitly — same trust boundary
as today. A coarse policy on `corpus.*`: `grant select to authenticated; revoke insert/update/delete`.

---

## 6. Incremental-ingest strategy

System of record = `corpus`. Every write goes through a deterministic ingest job (code files,
Claude only infers/classifies). All sources (e-SCR bulk, DevDataLab bulk, Indian Kanoon API,
HITL paste/upload, opt-in paid API) funnel into the **same upsert pipeline**.

### 6.1 Natural keys (idempotency anchors)
- **case** → `cnr` (16-char, globally unique).
- **hearing** → `(cnr, hearing_date, purpose)`.
- **cause_list_entry** → `(court_id, list_date, item_no)`.
- **judgment** → `neutral_citation` (fallback `(court_id, judgment_date, doc_hash)`).
- **person/advocate** → `bar_number` else resolved `name_norm` within court (§5.2).

### 6.2 Bulk historical load
1. Stage raw files (Parquet/JSON/PDF-metadata) in Supabase Storage; record a `source_batch`.
2. Normalize to canonical shapes; compute `content_hash`.
3. `COPY` into staging tables, then `INSERT … SELECT … ON CONFLICT (cnr) DO UPDATE` into live
   (idempotent — re-running the same batch is a no-op via hash check).
4. Resolve entities (strong keys → fuzzy → review queue); backfill link tables + facet arrays.
5. Build/refresh indexes after the big load (create indexes post-`COPY` for speed).

### 6.3 Daily incremental upsert (idempotent)
1. New `source_batch(kind='daily')` with a **watermark** = the high-water mark of the last
   successful run per source (e.g. last `list_date` ingested for cause lists, max `last_synced_at`
   for an API page cursor, or the source's own change-feed token). Resume from the watermark; a
   crashed run re-runs safely because every write is keyed + hash-guarded.
2. For each incoming record: normalize → compute `content_hash` → `ON CONFLICT … DO UPDATE`:
   - **new key** → insert; `change_event(insert)`; `first_seen_at = now()`.
   - **existing, same hash** → update `last_synced_at` only. No history. (The common case.)
   - **existing, different hash** → update snapshot + one **field-diff** `change_event(update)`.
3. **Daily diffing without re-reading everything:** prefer source-side deltas (Indian Kanoon
   date-bounded `search`; cause lists are inherently date-scoped; HITL is event-driven). Where a
   source only offers full pulls, the `content_hash` comparison turns a full pull into a cheap
   diff — only changed rows produce history.
4. Commit the batch: set `row_count`, advance the `watermark`. A failed batch leaves the watermark
   un-advanced, so the next run retries the same window idempotently.

### 6.4 Change detection summary
- **What changed** = `content_hash` mismatch on the natural key.
- **History size** = O(actual changes), not O(daily volume), because unchanged rows never log.
- **Auditability** = replay `change_event.diff` for a CNR to reconstruct status-over-time, with
  `source_batch` giving full provenance (which source, when, which watermark) — satisfying the
  brief's "source + last_synced_at + verify against official record" requirement.

---

## 7. Trade-offs accepted / escape hatches

- **Accepted:** Postgres aggregate performance is merely *good*, not *great*, at tens of millions
  of rows. **Escape hatch:** when a dashboard query gets slow, add a **DuckDB/Parquet or
  ClickHouse** read-only analytics sidecar fed from `change_event`/nightly exports — not a
  re-platform. (The Hybrid, adopted reactively.)
- **Accepted:** `pg_trgm`+`tsvector` name/full-text search is good, not best-in-class. **Escape
  hatch:** project `person`/`case`/`judgment` into **OpenSearch** only if search quality becomes a
  product gap.
- **Accepted:** single-instance scaling. **Escape hatch:** the `corpus` schema can be lifted to its
  own Postgres instance (it's already isolated behind the adapter) before MongoDB's sharding story
  would ever be the right answer at Gujarat scale.
- **Re-evaluate MongoDB** only if §4's three-part counter-case (standalone doc service + violent
  schema churn + Atlas Search as differentiator) all become true.

---

## 8. Decision

**Postgres in the existing Supabase project, dedicated `corpus` schema** (§5 schema, §6 ingest).
MongoDB is capable but wins on axes this app doesn't need (sharding, raw-payload churn, OOTB
search) and loses on the axis that dominates here (relational integration with the RLS tenant
store, entity resolution, one ops surface, one types file). Keep the analytics/search **sidecar
Hybrid** as the documented next step, adopted only against a measured limit — never MongoDB as a
second system of record for this workload.
