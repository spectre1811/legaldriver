# CI — the gate matrix (WO-11)

What runs on every PR, what's dormant, and how to activate the rest.

## Workflows

| Workflow | File | Gates a PR? | What it does |
|---|---|---|---|
| **CI** | `.github/workflows/ci.yml` | ✅ yes (`build` check) | `npm ci` → `lint` → `typecheck` → `build` → **secret-free test suite** (`node scripts/run-tests.mjs offline`). |
| **DB Tests** | `.github/workflows/db-tests.yml` | ⏸ dormant | DB/RLS integration tests. Runs on push to `main` + on demand (`workflow_dispatch`) — **not** on `pull_request` (see below). Self-skips (green no-op) until the `TEST_ENV_FILE` secret exists. Separate workflow so it never feeds the automerge queue. |
| automerge | `.github/workflows/automerge.yml` | — | Label-gated merge queue (unchanged by WO-11). |

## The test suite (`scripts/run-tests.mjs`)

`tests/*.ts` are standalone [tsx](https://tsx.is) entrypoints that exit non-zero on
failure. The runner groups them so CI can gate on the secret-free ones and keep the
rest opt-in:

```
node scripts/run-tests.mjs offline   # mocked tests (18 today) — no network, no .env → CI `build` gate
node scripts/run-tests.mjs db        #  4 tests — need a live Supabase + .env → DB Tests workflow
node scripts/run-tests.mjs net       #  5 tests — need a running server / LLM / court-API → manual only ($)
node scripts/run-tests.mjs all       # everything (run locally with .env sourced)
```

The runner **self-polices**: every invocation globs `tests/*.ts` and emits a GitHub Actions
`::warning::` (visible on the PR) naming any test not in a group, so a test another session
adds is surfaced rather than silently un-gated. It **warns, not fails** — CI runs on the PR
merge-ref (branch + current `main`), so a hard failure here would let one concurrently-merged
unclassified test block every subsequent PR. Classify new tests into a group to clear it.

tsx is pinned in the runner (no repo devDependency, so CI wiring stays a CI-only change).
Each test shells out to `npx --yes tsx@4.23.0`, which fetches tsx from the npm registry on
first use (it's not in the lockfile). A rare registry hiccup would surface as a non-zero exit
— i.e. an infra failure that looks like a test failure. If CI reds with a tsx-fetch error in
the log tail rather than a test assertion, re-run; it's not your code.

### Why the offline tests live *inside* the `build` job

`automerge.yml`'s label path only inspects the check whose name contains `"build"`
(`check_runs.filter(c => c.name.toLowerCase().includes('build'))`). A separate `test`
job would produce a `test` check that the label path ignores — merges wouldn't gate on
it. Running the offline suite as a step of the `build` job puts it under the one check
automerge actually enforces, on both its triggers.

## The DB tests (active)

The 4 DB/RLS tests hit a live Supabase with the service role, so they run against a dedicated
**throwaway** test project — never prod. This is **already wired**: the `TEST_ENV_FILE` repo
secret is set, and the DB Tests workflow writes it to `.env` and runs `run-tests.mjs db`.

The 4 tests all pass headless against a seeded demo tenant: `p1_smoke` (sign-in + RLS tenant
scope), `rls_isolation` + `portal_isolation` (cross-tenant / portal isolation), `wo01_tenancy_sync`.

To reproduce / rotate the throwaway DB:
1. Create a **throwaway** Supabase project (Management API `POST /v1/projects`; free tier).
2. Apply every `supabase/migrations/*.sql` in order (Management API `POST /v1/projects/{ref}/database/query`).
3. Seed the demo tenant with the test password: `DEMO_PASSWORD=demo-pass-1234 tsx scripts/seed-demo.ts`
   (against the test project's `.env` — the seed creates `demo@lexdriver.test` that `p1_smoke` signs in as).
4. Set the `TEST_ENV_FILE` repo secret = the test project's full `.env`
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `REPLY_TO`).

Promote the DB Tests check to required via branch protection once you want it to gate merges
(today it runs on `push:[main]` + `workflow_dispatch`, advisory).

## Running tests locally

```
node scripts/run-tests.mjs offline          # no setup needed
set -a; source .env; set +a                  # then, for the db/net groups:
node scripts/run-tests.mjs db
```
