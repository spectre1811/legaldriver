# Court-data ingest pipeline + infra: bulk + daily-incremental, compliant by construction

**Date:** 2026-06-28 · **Status:** accepted (design; no app code yet)
**Builds on:** `2026-06-24-court-data-strategy.md` (the hard line), `2026-06-25-court-data-sourcing.md`
(which sources are free/compliant/off-limits), `2026-06-24-cron-scheduling.md` (pg_cron+pg_net).
**Reuses:** the self-hosted worker pattern (`scripts/classify-worker.ts`), the `CourtDataClient`
seam (`src/lib/court/*`), `unpdf` extraction (`src/lib/docs/extract.ts`), the read-through gateway
+ shared `court_cache` (`src/lib/court/gateway.ts`), and the local-Claude / local-embeddings
keyless backends the worker already runs.

## 0. Scope and the hard line (restated, load-bearing)

This designs the *plumbing* to build and keep fresh a large Indian court-data corpus. It does not
change the sourcing posture: **compliant inputs only.** Allowed sources, exactly:

1. **Bulk open datasets** — DevDataLab judicial data (81M district cases 2010–2018, ODbL/DbCL),
   e-SCR SC judgments bulk mirror (vanga S3, CC-BY-4.0).
2. **Openly-published court files permitted by robots/ToS** — India Code statutes, data.gov.in
   judiciary datasets (documented dataset APIs), Indian Kanoon **API** (licensed, paid-per-call,
   free credit) for judgment text/citations.
3. **Our existing HITL capture** — human solves the eCourts CAPTCHA, pastes/uploads the case page
   or order PDF; we parse it (`hitl-parse.ts`, `causelist-parse.ts`).
4. **Cause-list uploads** — advocate-supplied daily cause-list PDFs.
5. **OPTIONAL licensed API** — eCourtsIndia/Vakeel360 **consumed as a paying customer**, opt-in,
   behind `CourtDataClient`; never the default, never replicating their fetch method.

**Forbidden, in the pipeline and everywhere:** no eCourts CAPTCHA bypass/solving, no headless
bot-scraping of `services.ecourts.gov.in` / `hcservices.ecourts.gov.in` / `dcourts.gov.in` /
`judgments.ecourts.gov.in`, no calling the eCourts mobile-app/Kleopatra-style endpoints, no
defeating any access control. Every connector in this design carries a `compliance` tag and the
runner refuses to execute a connector not on the allow-list. **Provenance + disclaimer travel with
every row** (`source`, `last_synced_at`, license, "not legal advice — verify against the official
record"), per the brief's non-negotiables.

## 1. Two stores: OLTP (tenant app) vs analytical corpus

The existing Postgres is the **OLTP / system-of-record** for *tenant matters* (`matter`,
`hearing`, `court_order`, `cause_list_entry`, `document`, `document_chunk`), under RLS, plus the
shared, RLS-bypassed `court_cache` + `court_provider_health`. That store stays exactly as-is and is
**demand-driven** (we only store matters a tenant tracks).

The corpus we're now building (tens of millions of historical district cases, ~35k SC judgments +
text, statute spine, court directory) is **not tenant-owned, large, append-mostly, and analytical**.
Mixing it into the RLS OLTP tables would bloat them and confuse provenance. So:

- **`corpus` schema** in the same Supabase Postgres (separate Postgres schema, not `public`), or a
  **separate analytical Postgres/DuckDB** if volume warrants. Tables are **not tenant-scoped** and
  have **RLS off** — they hold only public, licensed, non-PII (or anonymised) reference data, reached
  only via the service-role admin client and read-only RPCs. Treat the same way `court_cache` is
  treated today (shared infra, admin-only, aggregate-exposed).
- Corpus → OLTP is a **read path, never a write path into RLS tables**: when a tenant adds a CNR, the
  gateway may *seed* a matter from the corpus (provenance `source='corpus:devdatalab'` etc.), but the
  matter row is still created under the tenant. The corpus never owns tenant rows.

Core corpus tables (DDL is a follow-up migration `00NN_corpus_spine.sql`):

| Table | Holds | Key |
|---|---|---|
| `corpus.court` | court directory: code, name, level (SC/HC/district/taluka), state, jurisdiction metadata | `court_code` |
| `corpus.case` | normalized historical/aggregate case rows (DevDataLab + parsed HITL/licensed) | `cnr` (canonical), fallback composite |
| `corpus.case_party`, `corpus.case_hearing` | child rows | FK `case` |
| `corpus.judgment` | SC/HC judgment metadata + storage ref to the PDF/text in Supabase Storage | `judgment_id` |
| `corpus.judgment_chunk` | embedded chunks (local bge-small) for semantic search | FK `judgment` |
| `corpus.statute` / `corpus.statute_section` | India Code acts/sections (feeds `deadline_rule`) | act+section |
| `corpus.entity_party`, `corpus.entity_advocate` | canonicalized name dictionary for entity resolution | surrogate id |
| `corpus.source` | per-source registry: license, robots/ToS check, attribution string, last bulk load | `source_key` |

Every fact row carries `source_key`, `source_url`, `license`, `ingested_at`, `batch_id`.

## 2. The job/queue table (durability + resumability)

All ingestion is durable work items, not fire-and-forget. New tables in `public` (admin-only, RLS
off — they're infra, like `court_cache`):

```
ingest_job        -- one logical run (a bulk load, or a daily incremental tick for one connector)
  id, connector, mode('bulk'|'incremental'), status('queued'|'running'|'done'|'failed'|'partial'),
  watermark_in, watermark_out, params jsonb, stats jsonb, attempts, lease_until, claimed_by,
  created_at, started_at, finished_at, error text

ingest_task       -- a resumable unit WITHIN a job (a CSV shard, a PDF, one CNR, one Kanoon doc)
  id, job_id, connector, stage('fetch'|'parse'|'normalize'|'resolve'|'upsert'),
  status, idempotency_key (unique), payload jsonb, attempts, next_attempt_at, last_error,
  result jsonb

ingest_watermark  -- per (connector) high-water mark for incremental deltas
  connector PK, cursor jsonb (e.g. {last_modified, last_id, last_date}), updated_at

ingest_deadletter -- tasks that exhausted retries; never silently dropped
  id, task_id, connector, stage, payload, error, failed_at, reviewed bool
```

`idempotency_key` is the spine of correctness: e.g. `devdatalab:2016:shard-0042:row-1234567`,
`escr:civil-appeal-1234-1999`, `kanoon:doc/175773417`, `hitl:CNR:GJAH...`. A task that's already
`done` is skipped on replay → **at-least-once delivery, exactly-once effect**. Claiming uses a
`lease_until` so a crashed worker's tasks are re-leased after the lease expires (no global lock).

## 3. Pipeline stages (discrete, resumable, one task per stage)

Each connector flows through the same five stages; each stage is a separate `ingest_task` row so a
failure isolates to one stage of one unit and resumes from there (not from the top):

1. **fetch / acquire** — pull bytes from the compliant source. Bulk: stream a large CSV/Parquet
   shard from S3/Dropbox, or a judgment PDF, into Supabase Storage (`corpus-raw/<source>/<batch>/…`)
   so re-parsing never re-downloads. Incremental: call the source's *documented* delta mechanism —
   Kanoon `search?formInput=...&fromdate=...` windowed by watermark; data.gov.in dataset API with
   `updated_since`; HITL/cause-list = the already-uploaded blob. **Rate-limited + backoff** per
   source (token-bucket; Kanoon respects its documented per-call pricing/limits, off-peak batching).
   No connector is allowed to fetch from a CAPTCHA-gated URL — enforced by an allow-list of hostnames.
2. **parse** — bytes → raw structured records. CSV/Parquet via a streaming parser (never load 81M
   rows in memory; shard + stream). PDFs (judgments, cause lists, HITL orders) via **`unpdf`
   (`src/lib/docs/extract.ts`)** → text, with the `needsOcr` flag preserved for image-only scans
   (OCR is a future task, not a silent empty). Judgment HTML via a defensive text extractor.
   Cause-list text → `parseCauseList` / `parseEcourtsCauseList`; case pages → `parseEcourtsCapture`.
   Parsers stay **pure** (no I/O) like the existing ones, so they're unit-testable on fixtures.
3. **normalize** — map source-specific records → the existing `NormalizedCase` / a corpus row shape.
   Court codes → `corpus.court` canonical codes; dates → ISO; acts/sections → canonical strings
   ("NI Act 138"); provenance stamped. This is where a source adapter lives — the same "adapters
   map provider → our types" rule already used for `CourtDataClient`.
4. **dedup / entity-resolve** — **CNR is the canonical key** (16-char, unique); dedup on CNR first.
   No CNR → fuzzy composite (court + case-type + number + year + normalized party names). Party and
   advocate names are canonicalized against `corpus.entity_*` (lowercase, strip honorifics/"Adv."/
   "M/s", collapse whitespace, optional trigram similarity ≥ threshold). Per "LLM infers,
   deterministic code verifies": Claude (local CLI on the worker) may *propose* a merge for an
   ambiguous pair; deterministic code commits it; **low-confidence → a review queue
   (`ingest_deadletter` flavored `needs_review`), never an auto-merge that loses data.**
5. **upsert (with provenance)** — write to the corpus tables (or, for HITL/licensed live data
   about a *tracked* matter, through the existing `upsertCase` in `src/lib/court/sync.ts`, which is
   already idempotent: replaces hearings/orders, re-schedules reminders, stamps `source` +
   `last_synced_at`). Upserts are `ON CONFLICT` keyed on the canonical key → idempotent re-runs.

## 4. Bulk mode vs incremental mode

**Bulk (one-time historical load).** For DevDataLab (81M rows) and e-SCR (~52 GB). Runs on the
**self-hosted worker box** (the only place with the time, disk, and bandwidth — Vercel functions
can't). Pattern: one `ingest_job(mode='bulk')` fans out into thousands of `ingest_task` shards
(one per CSV chunk / per judgment file). The worker drains tasks in bounded batches (like the
existing worker's `BATCH`/`slice` discipline), checkpointing `watermark_out` after each shard so a
restart resumes mid-load. Disk-spill + `COPY`-style batched inserts into the corpus schema for
throughput. Idempotent by `idempotency_key`, so a re-run after a crash is a no-op for completed
shards. Bulk loads are **scheduled off-hours and rate-limited** so they never starve the live
classify/embed worker loop.

**Incremental (daily deltas).** A light daily tick per connector advances its `ingest_watermark`:

- **Kanoon judgments:** query new docs since `cursor.fromdate`; fetch only new doc ids; respect
  micro-fee budget (a daily cap in `params`).
- **data.gov.in / India Code refresh:** low-volume periodic re-pull of changed datasets/acts.
- **HITL + cause-list uploads:** event-driven, not time-driven — an upload enqueues an
  `ingest_task` immediately; the daily tick only sweeps for stragglers.
- **Licensed API (opt-in):** refresh tracked CNRs flagged stale (this already exists as
  `refreshCasesCached`); the incremental job just enqueues the stale set.

Both modes share the same stages, queue, idempotency, retry, and provenance — only the *driver*
(big fan-out vs small daily delta) and the *where it runs* differ.

**Reliability primitives (both modes):**
- **Idempotency:** `idempotency_key` + `ON CONFLICT` upserts (§2, §3.5).
- **Watermarks:** `ingest_watermark.cursor` per connector; advanced only after a shard/window fully
  upserts (never on fetch) so a crash can't skip data.
- **Retries w/ backoff:** `attempts` + `next_attempt_at` = exponential backoff w/ jitter; cap →
  dead-letter. Transient (network/429) retried; permanent (parse-shape) → dead-letter immediately.
- **Rate-limiting:** per-source token bucket in `params`; Kanoon/licensed APIs respect documented
  limits + a daily spend cap.
- **Partial-failure isolation:** one bad row/PDF dead-letters its task; the job continues and ends
  `partial`, not `failed`. The 80M-row load is never sunk by one malformed line.
- **Resumability:** lease-based claiming + per-stage tasks → any restart picks up exactly where it
  stopped.

## 5. Scheduling & where each piece runs

- **Heavy/bulk + all AI/parse/embed work → the self-hosted worker box.** We extend the existing
  `scripts/classify-worker.ts` loop with an **ingest tick** alongside its current `pass()` /
  `summarize()` / `embedDocuments()` / `answerPending()` ticks: each loop, the worker (a) claims a
  bounded batch of due `ingest_task`s (oldest `next_attempt_at`, unexpired lease), (b) runs the
  stage, (c) writes results / advances watermark / dead-letters. This reuses the worker's existing
  strengths — outbound-only, local keyless Claude for entity-merge proposals, local bge-small for
  judgment-chunk embeddings, the `createAdminClient()` it already imports. New `INGEST_*` env knobs
  mirror the existing `WORKER_*` ones. A separate `npx tsx scripts/ingest-worker.ts --loop` can run
  it as its own process for big bulk loads so it doesn't compete with the live classify loop.
- **Light triggers → pg_cron + pg_net** (the mechanism already in `supabase/scheduled-jobs.sql`).
  A daily `ld_ingest` cron calls a new `CRON_SECRET`-gated `/api/cron/ingest` endpoint that only
  **enqueues** `ingest_job(mode='incremental')` rows (one per due connector) + advances nothing
  itself. The endpoint does *no* heavy work (Vercel-safe, <30s) — it's a doorbell; the worker does
  the lifting. This keeps the proven "DB schedules, worker executes" split.
- **Event-driven enqueue** for HITL/cause-list uploads: the upload handler inserts an `ingest_task`
  directly (no waiting for the daily tick).

## 6. Monitoring & data-quality

- **Job/stage observability:** `ingest_job.stats` (rows in/out, dead-lettered, duration) +
  `cron.job_run_details` (already used). A `corpus_health()` `SECURITY DEFINER` RPC (modeled on
  `analytics_summary()`) surfaces corpus row counts, last successful load per connector, dead-letter
  backlog, and watermark ages — aggregate only, no per-tenant leakage.
- **Data-quality gates (run at end of each job, before committing the watermark):**
  - **Row-count / volume checks** — a bulk shard producing 0 rows, or a daily delta wildly outside
    the rolling norm (e.g. >5× or <0.2× the trailing median), is flagged `partial` and not
    watermarked, pending review (cheap anomaly detection, no ML needed).
  - **Schema/shape checks** — required fields present, CNR matches `^[A-Z]{4}\d{12}$`, dates parse,
    court_code resolves to `corpus.court`. Failures dead-letter the row.
  - **Dedup-rate check** — an unexpected spike in duplicate-CNR collisions signals a bad source
    batch or a key bug.
  - **Provenance completeness** — refuse to upsert any row missing `source_key`/`license`.
- **Dead-letter queue** is the safety net: nothing is silently dropped; `ingest_deadletter` is
  reviewable and replayable (`reviewed`/`requeue`). No PII in any log/error string (errors are
  truncated, bodies never logged — the existing `markHealth` discipline).

## 7. How it plugs into what exists

- **`CourtDataClient` seam:** unchanged interface. The corpus becomes the backing store for a new
  `OwnStoreCourtDataClient` impl (already anticipated in `client.ts`) — reads come from `corpus.*` /
  `court_cache` first, the licensed provider only on miss/opt-in. Selection stays the one-file
  `getCourtDataClient()` switch.
- **`gateway.ts`:** the read-through cache + provider-health layer is untouched; the ingest pipeline
  is the *write* side that fills the corpus the gateway reads. HITL/licensed live data for tracked
  matters still flows through `upsertCase` (`sync.ts`) into the RLS OLTP tables exactly as today.
- **`extract.ts`:** the single PDF/text extractor for every PDF stage (judgments, cause lists, HITL
  orders) — `unpdf`, `needsOcr` preserved.
- **The worker:** one more tick in the existing loop; same outbound-only, keyless, admin-client
  posture. No new inbound surface, no tunnel.
- **pg_cron/pg_net:** one more daily job pointing at one more `CRON_SECRET`-gated endpoint.

## 8. Phasing (maps onto the sourcing doc's Phases A–F)

1. **Infra first:** `ingest_job`/`task`/`watermark`/`deadletter` tables + the `corpus` schema +
   the worker ingest tick + `/api/cron/ingest` doorbell + `corpus_health()`. No data yet.
2. **Statute/court spine** (free, no PII) — India Code + data.gov.in → `corpus.statute` /
   `corpus.court`. Lowest risk; proves the pipeline end-to-end.
3. **Judgment corpus** — e-SCR bulk load (one-time) + Kanoon incremental, with embeddings.
4. **Historical backbone** — DevDataLab bulk load into `corpus.case` (anonymised, ODbL, clearly
   separate from tenant matters); powers entity-resolution + coverage maps.
5. **HITL/cause-list** already live — just route their parsed output through the same task pipeline
   for uniform provenance + retries.
6. **Licensed API** stays opt-in, consumed as a customer, behind the seam.

## 9. Risks / honest flags

- The **live per-case status gap is still real** — this pipeline does not (and must not) close it by
  scraping; it makes the *compliant* layers (judgments, statutes, historical, HITL, opt-in licensed)
  large and fresh. Auto live-status remains blocked pending NJDG opening to non-institutional users.
- **Worker box is a single point** for heavy work; bulk loads are long. Mitigated by resumability +
  leases + checkpointed watermarks, but a managed queue (e.g. a small VPS pool) is the scale-up path.
- **License hygiene** must be enforced in code (attribution strings on e-SCR/DevDataLab, Kanoon
  per-call terms, DPDP minimisation) — the `corpus.source` registry + provenance-completeness gate
  are the enforcement points.
