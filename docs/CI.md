# CI — the gate matrix (WO-11)

What runs on every PR, what's dormant, and how to activate the rest.

## Workflows

| Workflow | File | Gates a PR? | What it does |
|---|---|---|---|
| **CI** | `.github/workflows/ci.yml` | ✅ yes (`build` check) | `npm ci` → `lint` → `typecheck` → `build` → **secret-free test suite** (`node scripts/run-tests.mjs offline`). |
| **DB Tests** | `.github/workflows/db-tests.yml` | advisory (post-merge) | DB/RLS integration tests against an **ephemeral local Supabase** (`supabase start`) spun up fresh on the runner — no secret, no remote DB. Runs on push to `main` + on demand (`workflow_dispatch`) — **not** on `pull_request` (see below). Separate workflow so it never feeds the automerge queue. |
| automerge | `.github/workflows/automerge.yml` | — | Label-gated merge queue (unchanged by WO-11). |

## The test suite (`scripts/run-tests.mjs`)

`tests/*.ts` are standalone [tsx](https://tsx.is) entrypoints that exit non-zero on
failure. The runner groups them so CI can gate on the secret-free ones and keep the
rest opt-in:

```
node scripts/run-tests.mjs offline   # the secret-free suite — no network, no .env → CI `build` gate
node scripts/run-tests.mjs db        #  4 tests — need a Supabase + .env → DB Tests workflow (ephemeral local stack)
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

## The DB tests (self-contained — WO-67)

The 4 DB/RLS tests hit a live Supabase with the service role, so the job spins up an **ephemeral
local Supabase on the runner** (`supabase start`) — never prod, and no long-lived remote DB to
rot. Every run: `supabase start` applies **all** `supabase/migrations/*` from a **clean state**
(so drift is impossible) with a **fresh PostgREST schema cache**, then the job seeds the demo
tenant and runs `run-tests.mjs db`. **No `TEST_ENV_FILE` secret is needed** — the job is entirely
self-contained.

The 4 tests pass headless against the freshly-seeded demo tenant: `p1_smoke` (sign-in + RLS tenant
scope), `rls_isolation` + `portal_isolation` (cross-tenant / portal isolation), `wo01_tenancy_sync`.

**Why this replaced the old remote-throwaway-DB wiring:** the previous job pointed at a hand-seeded
remote test project that nothing re-migrated. When WO-54 added `matter.tier` to prod, that separate
DB drifted (`matter.tier` absent) and every DB test died at `p1_smoke` before its RLS assertions —
the isolation tests silently stopped protecting anyone. A clean-migrate-per-run stack closes that
whole class of drift: the **next** additive migration can't re-break it (no manual reseed).

`config.toml` is generated in-CI by `supabase init` so it always matches the installed CLI (the
committed contract is the migrations, not a config file that could drift against the CLI version).

**To run the exact same suite locally** (needs Docker):
```
supabase start
eval "$(supabase status -o env)"
printf 'NEXT_PUBLIC_SUPABASE_URL=%s\nNEXT_PUBLIC_SUPABASE_ANON_KEY=%s\nSUPABASE_SERVICE_ROLE_KEY=%s\nDEMO_PASSWORD=demo-pass-1234\nCRON_SECRET=x\nREPLY_TO=x@x.test\n' \
  "$API_URL" "$ANON_KEY" "$SERVICE_ROLE_KEY" > .env
DEMO_PASSWORD=demo-pass-1234 npx tsx scripts/seed-demo.ts
node scripts/run-tests.mjs db
supabase stop
```

Promote the DB Tests check to required via branch protection once you want it to gate merges
(today it runs on `push:[main]` + `workflow_dispatch`, advisory).

## Running tests locally

```
node scripts/run-tests.mjs offline          # no setup needed
set -a; source .env; set +a                  # then, for the db/net groups:
node scripts/run-tests.mjs db
```
