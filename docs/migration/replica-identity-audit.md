# Replica-Identity Audit — Logical-Replication Readiness

**Work order:** WO-142 W0 (Vercel/Supabase → AWS migration prep)
**Date:** 2026-07-14
**Source of truth:** `supabase/migrations/*.sql` (39 migration files) — parsed statically, not read from a live DB.
**Scope:** READ-ONLY analysis. No migration or app code was modified.

## What / Why / How this was generated

**What.** A per-table audit of whether each application table has a usable PRIMARY KEY, and therefore whether it is ready for native Postgres logical replication of `UPDATE`/`DELETE` during the DB cutover (gated wave **W4**).

**Why.** The W4 cutover uses native Postgres logical replication (publication → subscription). Logical replication identifies rows for replicated `UPDATE`/`DELETE` using the table's **replica identity**, which defaults to the PRIMARY KEY. A table with **no** PRIMARY KEY will **fail** to replicate `UPDATE`/`DELETE` (Postgres raises `cannot update/delete ... because it does not have a replica identity and publishes updates`) unless it is set to `REPLICA IDENTITY FULL`, or given a `UNIQUE`-`NOT NULL` index used via `REPLICA IDENTITY USING INDEX`. `INSERT`-only replication works without a replica identity, but we cannot assume any app table is insert-only.

**How.** Every `CREATE TABLE` across the 39 migration files was enumerated, then reconciled against later `ALTER TABLE ... ADD PRIMARY KEY / ADD CONSTRAINT` and `ALTER TABLE ... ADD COLUMN` statements. PK detection covered all forms present in this repo: inline `id uuid primary key default gen_random_uuid()`, a text primary key (`provider text primary key`), an FK-as-PK (`id uuid primary key references ...`), and a table-level composite `primary key (col, col)`.

## Summary

| Metric | Count |
| --- | ---: |
| **Total app tables** (created by these migrations) | **51** |
| ✅ With a PRIMARY KEY (replication-ready) | **51** |
| ⚠️ Without a PRIMARY KEY (need `REPLICA IDENTITY FULL`) | **0** |
| 🚫 Extension / system tables (excluded — not app tables) | **0** created here |

**Bottom line: every application table has a usable PRIMARY KEY. The default replica identity (the primary key) suffices for all 51 tables. No `REPLICA IDENTITY FULL` / `USING INDEX` overrides are required for logical replication.**

There are **no** partitioned tables, **no** materialized views, and **no** tables with only a `UNIQUE` constraint but no PK. No app table is created in an extension-managed schema (`vault`, `auth`, `storage`, `cron`, `net`, `pgmq`, `extensions`, `graphql`) — those schemas are only *referenced* (e.g. `create extension supabase_vault with schema vault`, FKs to `auth.users`), never populated with app tables by these migrations. See **Extension / system schemas** below.

## Main table — replica-identity per app table

All tables are in schema `public`. Sorted so any no-PK **action items would appear at the top** — here there are none, so the table lists the (few) non-trivial PK shapes first, then the standard `id uuid` tables.

| schema.table | has_pk | pk_columns | replica_identity_action | notes |
| --- | :---: | --- | --- | --- |
| public.corpus_ingest_watermark | Y | `(source, partition)` | none (default = PK) | Composite PK — correct for a watermark/link table. Append/upsert on `ON CONFLICT (source,partition)`. |
| public.court_provider_health | Y | `provider` (text) | none (default = PK) | Text PK (one row per provider). |
| public.capture_token | Y | `token` (uuid) | none (default = PK) | PK column named `token`, not `id`. |
| public.profile | Y | `id` (uuid, FK→`auth.users`) | none (default = PK) | PK is also an FK to `auth.users(id)`. |
| public.portal_user | Y | `id` (uuid, FK→`auth.users`) | none (default = PK) | PK is also an FK to `auth.users(id)`. |
| public.firm_billing | Y | `tenant_id` (uuid, FK→`tenant`) | none (default = PK) | One-row-per-tenant; PK is the tenant FK. |
| public.notification_prefs | Y | `id` (uuid, FK→`profile`) | none (default = PK) | One-row-per-profile; PK is the profile FK. |
| public.tenant | Y | `id` | none (default = PK) | |
| public.advocate | Y | `id` | none (default = PK) | `bar_code` added later (0026). |
| public.client | Y | `id` | none (default = PK) | |
| public.matter | Y | `id` | none (default = PK) | High-churn core table; many later `ADD COLUMN`s (ai_summary, detail, party_names[], tier, deleted_at, etc.). PK stable throughout. |
| public.hearing | Y | `id` | none (default = PK) | |
| public.deadline | Y | `id` | none (default = PK) | `status`/`source`/`basis` added later (0023). |
| public.cause_list_entry | Y | `id` | none (default = PK) | |
| public.notice | Y | `id` | none (default = PK) | |
| public.notification | Y | `id` | none (default = PK) | |
| public.email_message | Y | `id` | none (default = PK) | High-write (ingest). `status` check added later (0031). |
| public.document | Y | `id` | none (default = PK) | Many later `ADD COLUMN`s (size_bytes, fts, category, content_hash, email_subject, portal_shared). |
| public.court_sync_job | Y | `id` | none (default = PK) | |
| public.oauth_connection | Y | `id` | none (default = PK) | `gmail_query` added later (0032). |
| public.audit_event | Y | `id` | none (default = PK) | **Append-only / high-write** (audit log). PK present. |
| public.deadline_rule | Y | `id` | none (default = PK) | Seeded reference data (0015). |
| public.calendar_event | Y | `id` | none (default = PK) | |
| public.practice_area | Y | `id` | none (default = PK) | |
| public.custom_field_def | Y | `id` | none (default = PK) | |
| public.activity_event | Y | `id` | none (default = PK) | **Append-only / high-write** (activity feed). PK present. |
| public.adverse_party | Y | `id` | none (default = PK) | |
| public.ip_asset | Y | `id` | none (default = PK) | |
| public.time_entry | Y | `id` | none (default = PK) | `invoiced_invoice_id` FK added later (0024). |
| public.expense | Y | `id` | none (default = PK) | `invoiced_invoice_id` FK added later (0024). |
| public.portal_message | Y | `id` | none (default = PK) | |
| public.court_cache | Y | `id` | none (default = PK) | Also has `UNIQUE (kind, cache_key, provider)` — PK still `id`. Shared-infra cache; high-write. |
| public.court_refresh_request | Y | `id` | none (default = PK) | |
| public.court_order | Y | `id` | none (default = PK) | **High-write** (order sync). Dedup unique index swapped to `(matter_id, order_id)` in wo156 — that's a unique *index*, PK remains `id`. |
| public.saved_view | Y | `id` | none (default = PK) | |
| public.msg_message | Y | `id` | none (default = PK) | **High-write** (messaging). `suggested_reply` added later (0013). |
| public.voice_recording | Y | `id` | none (default = PK) | |
| public.agent_thread | Y | `id` | none (default = PK) | |
| public.agent_turn | Y | `id` | none (default = PK) | **Append-only / high-write** (agent turns). PK present. |
| public.legal_reference | Y | `id` | none (default = PK) | Reference/law-pack data. |
| public.document_chunk | Y | `id` | none (default = PK) | **Embeddings / high-write** (`vector(384)` added 0012). PK present — the one most sensitive to a missing PK; it has one. |
| public.corpus_judgment | Y | `id` | none (default = PK) | Public court corpus; high-write on ingest. |
| public.corpus_source_batch | Y | `id` | none (default = PK) | Ingest batch log. |
| public.draft_template | Y | `id` | none (default = PK) | |
| public.draft | Y | `id` | none (default = PK) | |
| public.draft_version | Y | `id` | none (default = PK) | Also `UNIQUE (draft_id, version)` — PK remains `id`. |
| public.onboarding_run | Y | `id` | none (default = PK) | |
| public.invoice | Y | `id` | none (default = PK) | |
| public.invoice_line | Y | `id` | none (default = PK) | |
| public.outbound_email | Y | `id` | none (default = PK) | High-write (send queue). |
| public.ai_usage_event | Y | `id` | none (default = PK) | **Append-only / high-write** (metering/usage). PK present. |

### Append-only / high-write tables (called out per WO instruction)

These are the tables where a missing PK would hurt replication most (heavy `INSERT` volume, and `UPDATE`/`DELETE` on backfill/retention). **All of them have a PRIMARY KEY**, so none needs an override:

`ai_usage_event`, `audit_event`, `activity_event`, `agent_turn`, `document_chunk` (embeddings), `msg_message`, `email_message`, `outbound_email`, `court_order`, `court_cache`, `corpus_judgment`, `notification`.

## Pre-cutover DDL (paste at W4)

**None required.** Every application table in `public` has a PRIMARY KEY, so the default replica identity (the primary key) is used for all replicated `UPDATE`/`DELETE`. There are **zero** `ALTER TABLE ... REPLICA IDENTITY FULL;` statements to run.

For completeness, the template that *would* be used if a no-PK table were ever added:

```sql
-- (No statements needed for the current schema.)
-- Template for any future no-PK app table:
-- ALTER TABLE public.<table> REPLICA IDENTITY FULL;
-- Preferred alternative if a UNIQUE, NOT NULL index exists on the table:
-- ALTER TABLE public.<table> REPLICA IDENTITY USING INDEX <unique_not_null_index>;
```

**W4 note:** because all tables use PK-based replica identity, the publication can be created with `FOR ALL TABLES` (or an explicit list) without any per-table replica-identity preparation. Keep watching for schema drift — see the caveat below.

## Extension / system schemas (excluded — not app tables)

These migrations **reference** extension/system schemas but do **not** create app tables in them. They are managed by Supabase / the extension and are **out of scope** for this app's logical-replication publication:

- **`vault`** — `create extension supabase_vault with schema vault` (0002); functions read/write `vault.secrets`, `vault.decrypted_secrets` (0002, 0033). Managed by the Supabase Vault extension.
- **`auth`** — referenced only via FK (`references auth.users (id)` for `profile`, `portal_user`) and a `handle_new_user()` trigger. Managed by Supabase Auth. Not replicated as part of the app publication.
- **`storage` / `cron` / `net` / `pgmq` / `extensions` / `graphql`** — not created or populated by these migrations at all (no `create table` in any of them).

If the AWS target must reproduce Supabase-managed schemas (auth, storage, vault), that is handled by the platform-migration track, **not** by this table-level replication audit.

## Caveat — verify against the live catalog before W4

This audit is derived **statically from migration DDL**, not from the live production database. Before cutover you **must** confirm against the live catalog, because:

- Ad-hoc DDL, hotfixes, or Supabase dashboard edits may have changed a table without a checked-in migration.
- A table could have been given a non-default `REPLICA IDENTITY` out-of-band.
- Supabase / extension-managed tables you decide to include in the publication have their own replica-identity state.

Run this on the **live source** DB (against the primary, or a replica, with a `statement_timeout` set) to find any table in a to-be-replicated schema whose replica identity is **not** a usable PK (`relreplident`: `d`=default/PK, `f`=full, `n`=nothing, `i`=using index):

```sql
-- Tables with NO usable replica identity for UPDATE/DELETE replication.
-- relreplident: 'd' default(PK), 'f' full, 'i' using index, 'n' nothing
SET statement_timeout = '30s';
SELECT n.nspname                                   AS schema,
       c.relname                                   AS table,
       c.relreplident                              AS replica_identity,
       (c.relreplident = 'd'
        AND EXISTS (SELECT 1 FROM pg_index i
                    WHERE i.indrelid = c.oid AND i.indisprimary)) AS default_has_pk
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r','p')                       -- ordinary + partitioned tables
  AND n.nspname = 'public'                         -- add every schema you will replicate
  AND NOT (
        -- rows that ARE safe to replicate UPDATE/DELETE:
        c.relreplident IN ('f')                    -- REPLICA IDENTITY FULL
        OR (c.relreplident = 'd'                   -- default AND actually has a PK
            AND EXISTS (SELECT 1 FROM pg_index i
                        WHERE i.indrelid = c.oid AND i.indisprimary))
        OR (c.relreplident = 'i'                   -- USING INDEX with a valid index set
            AND EXISTS (SELECT 1 FROM pg_index i
                        WHERE i.indrelid = c.oid AND i.indisreplident))
      )
ORDER BY 1, 2;
```

An **empty result set** confirms this audit: every table has a usable replica identity, so the default (PK) suffices and no `REPLICA IDENTITY FULL` DDL is needed. Any rows returned are the exact tables to fix with `ALTER TABLE ... REPLICA IDENTITY FULL;` (or `USING INDEX`) before enabling the subscription.
