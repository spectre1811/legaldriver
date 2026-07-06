# WO-67 · DB Tests run on an ephemeral local Supabase (not a long-lived remote throwaway)

**Date:** 2026-07-06 · **Status:** Adopted · **Owner:** S-WO67-opus-20260706 · **Scope:** CI/test-infra (non-gated — no prod migration, no RLS/app-code change)

## Context / problem
The `DB Tests` workflow (`db-tests.yml`) — `p1_smoke`, `rls_isolation`, `portal_isolation`,
`wo01_tenancy_sync` — pointed at a **long-lived, hand-seeded remote throwaway Supabase** supplied
via the `TEST_ENV_FILE` secret. **Nothing ever re-migrated that project.** When WO-54 W1 added
`matter.tier` to prod (`20260706151107_wo54_matter_tier.sql`), the *separate* test DB drifted:
`matter.tier` was **absent** there, so `upsertCase` failed and every DB test died at `p1_smoke`
(`Could not find the 'tier' column of 'matter' in the schema cache`) **before reaching its RLS /
tenancy assertions**. Because `DB Tests` is advisory (the offline `build` job is the merge gate),
this produced no visible signal — the **tenant-isolation smoke tests silently stopped protecting
anyone**, and a real cross-tenant leak could have merged green.

Root cause is drift of a mutable long-lived test DB, not a one-off — the *next* additive migration
would re-break it the same way. A cache-reload alone would not fix it: the column was genuinely
absent (applied to prod, never to the test project).

## Decision
Make the job **self-contained and clean-per-run**: bring up an **ephemeral local Supabase** on the
runner with `supabase start` (via `supabase/setup-cli`). Every run applies **all**
`supabase/migrations/*` from an empty database (drift is structurally impossible) with a **fresh
PostgREST schema cache**, then seeds the demo tenant and runs `run-tests.mjs db`.

- **No secret** — `TEST_ENV_FILE` retired; the job needs nothing from the founder to run.
- **`config.toml` generated in-CI** by `supabase init` (not committed) so it always matches the
  installed CLI — the committed contract is the migrations, not a config file that drifts vs the CLI.
- **Demo seed password pinned** — the seed runs with `DEMO_PASSWORD=demo-pass-1234` because
  `p1_smoke` signs in with that value, while `seed-demo.ts` defaults to `peshi-demo-1234` (would 401).
- Also classified the previously-unclassified `wo50_auth_flows` test into the **offline** group
  (it is pure/committed-source, no secrets) so the runner's orphan warning is cleared.

## Alternatives considered
- **Keep the remote throwaway DB, migrate it each run.** Rejected: needs a *new* founder secret
  (DDL connection string — `TEST_ENV_FILE` has REST creds only), perpetuates a drift-prone
  long-lived DB, and `supabase db push` against a hand-seeded DB with no migration-history table is
  a collision trap. It also keeps the job blocked on a founder action (slower).
- **A bare Postgres service container + psql.** Rejected: the tests use `@supabase/supabase-js`
  Auth (`signInWithPassword`, `admin.createUser`) + PostgREST — they need the full Supabase stack,
  which `supabase start` provides.

## Consequences
- `DB Tests` runs on push to `main` + `workflow_dispatch` (still not on `pull_request`, so it never
  feeds the automerge `build` check). It adds ~1–2 min of Docker startup to each main-push run —
  acceptable for an advisory, post-merge safety net.
- **Verification honesty:** authored without a local Docker/Supabase CLI on the dev box, so the
  *green DB Tests* proof is the **post-merge run on `main`** (the job's only automatic trigger). The
  offline change (`wo50_auth_flows` classification) is locally proven (55/55 offline green, orphan
  warning gone). If the post-merge run surfaces a CLI/stack wrinkle, fix-forward — nobody is blocked
  (advisory job).
- Closes the drift class: the next additive migration cannot silently re-disarm the isolation tests.
