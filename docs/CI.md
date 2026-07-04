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
node scripts/run-tests.mjs offline   # mocked tests (17 today) — no network, no .env → CI `build` gate
node scripts/run-tests.mjs db        #  5 tests — need a live Supabase + .env → DB Tests workflow
node scripts/run-tests.mjs net       #  4 tests — need LLM/embeddings/court-API keys → manual only ($)
node scripts/run-tests.mjs all       # everything (run locally with .env sourced)
```

The runner **self-polices**: every invocation globs `tests/*.ts` and fails (exit 2) if any
file isn't in a group — so a test another session adds can't silently go un-gated.

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

## Activating the DB tests (founder)

The DB/RLS tests hit a live Supabase with the service role, so they need a real (throwaway)
project — never point them at prod.

1. Create a **throwaway** test Supabase project.
2. Apply `supabase/migrations/` and seed a demo tenant (`scripts/seed-demo.ts`).
3. Add one repo secret **`TEST_ENV_FILE`** = the full contents of a working `.env`
   (must include `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `REPLY_TO`).

The DB Tests workflow then writes `.env` from that secret and runs `run-tests.mjs db`.
Promote it to a required check via branch protection once it's proven green.

## Running tests locally

```
node scripts/run-tests.mjs offline          # no setup needed
set -a; source .env; set +a                  # then, for the db/net groups:
node scripts/run-tests.mjs db
```
