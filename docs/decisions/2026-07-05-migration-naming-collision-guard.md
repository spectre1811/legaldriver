# Migration naming: collision guard + timestamp scheme going forward

- **Date:** 2026-07-05
- **Status:** Accepted
- **Work order:** WO-41 (promoted from BACKLOG §D, "Migration hygiene", captured 2026-07-05 from WO-29)
- **Deciders:** S-WO41-opus-20260705 (build); founder review on merge

## Context

Migrations use a sequential `NNNN_<slug>.sql` scheme. Under the parallel multi-agent fleet,
two work orders independently grabbed the **same next integer**:

- `0031_email_status_archive.sql` (WO-29)
- `0031_profile_notification_prefs.sql` (WO-30)

Both were applied to prod, so today the live DB is correct. But two migrations sharing one
version is a latent bug:

- Supabase applies them in an **ambiguous order** (lexical by full filename, not intent).
- A **rebuild-from-migrations** (fresh env, disaster recovery, the CI test DB) runs both under
  one "0031" slot — repo↔DB drift, and any ordering assumption between them is silently wrong.
- The failure is **invisible** — nothing flagged the duplicate; it only bites on a rebuild.

The number of migrations only grows, and so does the collision probability with every new
concurrent work order. This needs to fail fast, at PR time, not on a future rebuild.

## Decision

1. **CI guard** — `scripts/check-migrations.mjs` (zero-dependency) checks `supabase/migrations/`:
   - **Version uniqueness** — no two files may share the version token (the part before the
     first `_`). This is the real bug.
   - **Naming shape** — `<version>_<slug>.sql`, version = 4-digit legacy `NNNN` **or** 14-digit
     Supabase timestamp, slug = lowercase `a-z0-9`, `_`-separated.
   - It runs as an **offline test** (`tests/wo41_migration_guard.ts`, registered in the WO-11
     offline group) so it **gates every PR** via the `build` check — no CI-YAML change.

2. **New migrations use `supabase migration new <slug>`** — this stamps a unique
   `YYYYMMDDHHMMSS_` timestamp version. Collisions become **impossible by construction** (two
   agents don't get the same second, and even if they did the guard catches it), with **no
   cross-agent coordination** on "the next number". Timestamp versions sort lexically **after**
   all existing `NNNN_` files, so ordering is preserved. Legacy `NNNN_` files stay as-is.

3. **The existing `0031` pair is grandfathered, not renamed.** Both filenames are already
   recorded in the live `supabase_migrations.schema_migrations`. Renaming a file whose version
   is already applied makes Supabase treat it as a **new, unapplied** migration and try to
   **re-run** it (→ "already exists" errors) — a prod-DB operation, and founder-gated. So the
   guard allows `0031` exactly twice (`GRANDFATHERED = { "0031": 2 }`) and **bars a third**.
   This documents the debt without touching prod. **No new grandfathers** — a future collision
   is a bug to fix (rename the *unapplied* branch's file before merge), never to allow.

## Consequences

- A PR that adds a colliding or malformed migration **fails CI** with a message naming the
  version and pointing here.
- Contributors run `supabase migration new <slug>` (or `npm run check:migrations` locally).
- The one known historical collision (`0031`) is captured and capped; the live DB is untouched.

## Alternatives considered

- **Rename one 0031 to 0037** — rejected: desyncs repo↔DB (founder-gated re-run risk) for no
  runtime benefit; the guard captures the debt more safely.
- **`NNNN_<wo-id>_slug`** — rejected: the version token is still `NNNN`, so two WOs picking the
  same integer still collide on the version. Only a globally-unique version (timestamp) fixes
  the root cause.
