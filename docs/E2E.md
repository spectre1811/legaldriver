# E2E testing (WO-36) — deterministic gate + agentic QA

Two layers, different jobs:

- **Layer 1 — Deterministic E2E (the merge gate).** Playwright Test. Every route renders clean;
  hero journeys pass; a11y + visual baselines hold. Green = mergeable. **This doc + Phase 0 land Layer 1's foundation.**
- **Layer 2 — Agentic exploratory tester (advisory).** Playwright MCP + Claude navigates like a human,
  scores UX against the polish rubric, files bugs. Never a merge gate. *(Phase 2+.)*

## Phase status
- **Phase 0 ✅ (merged)** — Playwright config, one-time auth (`auth.setup.ts`, advocate + junior),
  auto route inventory (`scripts/gen-routes.mjs` → `e2e/routes.generated.json`, 42 routes), the
  login→dashboard smoke, per-route render/console/network health gate.
- **Phase 1 ✅ (this change)** — **public/authed project split** (public routes tested *unauthenticated*,
  so `/` and `/login` are no longer silently redirected to `/dashboard`); per-route **`@axe-core/playwright`**
  a11y scan (fails on `critical`, tunable via `A11Y_MAX_IMPACT`) + **`<main>`-landmark** assertion;
  **dynamic routes seeded** via `E2E_ROUTE_IDS`; a **settle** (networkidle) before the console/network guard.
  The **WO-35 hero journeys** already landed as specs in WO-35 W4 (`e2e/hero-*.spec.ts`). An **activatable
  `.github/workflows/e2e.yml`** runs the whole suite in CI (dormant until the founder enables it — see below).
- **Phase 1b (next)** — **visual snapshots** (`toHaveScreenshot`): baselines must be generated on the CI
  Linux runner (`--update-snapshots`) and committed, so this lands after the E2E workflow is activated.
- **Phase 2–4** — agentic explorer MVP, auto-issue filing w/ dedup, spec-graduation, nightly sweep + cost caps.

## Activating the `E2E` CI workflow (founder, one-time)
`.github/workflows/e2e.yml` is **advisory** (named `E2E`, not `CI` — it can never gate/wedge the
auto-merge queue) and **dormant** until you provision a demo test env. To turn it on:
1. Repo → Settings → Secrets and variables → Actions → **Variables**: add `E2E_ENABLED = true`.
2. **Secrets**: `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY` (a **demo** Supabase project), `E2E_EMAIL`,
   `E2E_PASSWORD` (demo advocate), optional `E2E_EMAIL2`, `E2E_ROUTE_IDS` (demo seed ids, e.g.
   `{"id":"<matter-uuid>","judgeId":"<uuid>","barId":"12345"}`).
Until then the job is **skipped** (neutral, never red). Once green across a few PRs, promote it to a
required check (branch protection, or add an `e2e`-named check to `automerge.yml`'s green filter).

## Running locally
```bash
npm ci                        # installs @playwright/test + @axe-core/playwright (new devDeps)
npx playwright install --with-deps chromium
# demo-tenant creds against a DEMO_MODE=1 env (the suite clicks real actions incl. "send"):
export E2E_EMAIL=...  E2E_PASSWORD=...  [E2E_EMAIL2=...]
npm run test:e2e              # headless; auto-starts `npm run dev` with DEMO_MODE=1
npm run test:e2e:ui          # debug UI
npm run test:e2e:update      # refresh visual baselines
npm run gen:routes           # re-inventory routes after adding/removing a page
```

Against a deployed **DEMO_MODE=1** preview/prod instead of the local dev server:
```bash
export E2E_BASE_URL=https://<demo-preview>.vercel.app   # webServer is skipped when non-local
```

## Env
| Var | Meaning |
|---|---|
| `E2E_BASE_URL` | URL under test (default `http://localhost:3000`; local ⇒ auto-starts a server in DEMO_MODE) |
| `E2E_WEBSERVER_CMD` | server command when local (default `npm run dev`; CI uses `npm start` against a prebuilt app) |
| `E2E_EMAIL` / `E2E_PASSWORD` | demo advocate login (aliases: `DEMO_EMAIL` / `DEMO_PASSWORD`) — **required** for authed specs |
| `E2E_EMAIL2` | demo junior/second-role login (optional; junior specs skip if unset) |
| `E2E_ROUTE_IDS` | JSON map of dynamic-route param → id, e.g. `{"id":"<uuid>","judgeId":"<uuid>","barId":"12345"}` — dynamic routes skip unless seeded |
| `A11Y_MAX_IMPACT` | axe severity floor to fail on: `critical` (default) → tighten to `serious` once the baseline is clean |

## Guardrails
- **DEMO_MODE=1 only.** The suite logs into the seeded demo tenant and clicks real actions; never point it at a real tenant. `DEMO_MODE` **is now honored in the app** (WO-08, merged): `isDemoMode()` in `src/lib/demo.ts` forces `getMailer()`/`getMessagingClient()` to console/mock impls, so outbound email/WhatsApp/SMS is sandboxed. (Re-verify after touching a send path: `grep -rn DEMO_MODE src/lib/notify src/lib/services/messaging`.)
- Deterministic layer gates; the agentic layer only advises (LLM explorers over-click/hallucinate — documented failure mode).
- Auth state (`playwright/.auth/`) + run artifacts are git-ignored. **Visual baselines** are committed once generated (Phase 1b — must be produced on the CI Linux runner to match, not on a dev macOS box).

## Known setup notes
- `playwright` (the library) is already a devDep; this change adds `@playwright/test` (the runner) + `@axe-core/playwright`. A fresh `npm ci` picks them up. Chromium binaries were already present in this environment.
- The seeded **demo tenant + `DEMO_MODE`** (WO-08) must be reachable by the test env for authed specs to run; until those creds/env are wired in CI, `auth.setup` skips with a clear message and the authed specs are skipped (not failed).
