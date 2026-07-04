# E2E testing (WO-36) — deterministic gate + agentic QA

Two layers, different jobs:

- **Layer 1 — Deterministic E2E (the merge gate).** Playwright Test. Every route renders clean;
  hero journeys pass; a11y + visual baselines hold. Green = mergeable. **This doc + Phase 0 land Layer 1's foundation.**
- **Layer 2 — Agentic exploratory tester (advisory).** Playwright MCP + Claude navigates like a human,
  scores UX against the polish rubric, files bugs. Never a merge gate. *(Phase 2+.)*

## Phase status
- **Phase 0 (this change) ✅** — Playwright config, one-time auth (`auth.setup.ts`, advocate + junior roles),
  auto route inventory (`scripts/gen-routes.mjs` → `e2e/routes.generated.json`, 42 routes), the
  login→dashboard smoke, and a per-route render/console/network health gate over all 34 static routes.
- **Phase 1 (next)** — per-route `@axe-core/playwright` + visual snapshots + `<main>`-landmark assert;
  seed dynamic routes (`E2E_ROUTE_IDS`); the **WO-35 hero journeys** as specs; wire the `e2e` job into
  `ci.yml` as a required check.
- **Phase 2–4** — agentic explorer MVP, auto-issue filing w/ dedup, spec-graduation, nightly sweep + cost caps.

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
| `E2E_BASE_URL` | URL under test (default `http://localhost:3000`; local ⇒ auto-starts dev in DEMO_MODE) |
| `E2E_EMAIL` / `E2E_PASSWORD` | demo advocate login (aliases: `DEMO_EMAIL` / `DEMO_PASSWORD`) — **required** for authed specs |
| `E2E_EMAIL2` | demo junior/second-role login (optional; junior specs skip if unset) |

## ⚠️ Phase-1 prerequisite — the DEMO_MODE outbound sandbox must actually exist first
Phase 0 only navigates + smoke-tests (login→dashboard, per-route render) — it **never clicks a "send"**, so it is safe today. But the config sets `DEMO_MODE=1` on the promise that it sandboxes outbound email/WhatsApp/SMS, and **that short-circuit is not yet in `main`** (`grep DEMO_MODE src/` = 0; the WO-08 sandbox is on an unmerged branch). **Do NOT ship any Phase-1 spec that triggers an outbound action (notice→escalate, send-reminder, etc.) until the app honors `DEMO_MODE` in every send path** — otherwise those specs fire REAL messages. Verify with `grep -rn DEMO_MODE src/lib/notify src/lib/services/messaging` before enabling send-path journeys.

## Guardrails
- **DEMO_MODE=1 only.** The suite logs into the seeded demo tenant and clicks real actions; never point it at a real tenant. `DEMO_MODE` is *intended* to sandbox all outbound email/WhatsApp/SMS — but see the prerequisite above: that sandbox must be implemented + verified in the app before any send-path spec runs.
- Deterministic layer gates; the agentic layer only advises (LLM explorers over-click/hallucinate — documented failure mode).
- Auth state (`playwright/.auth/`) + run artifacts are git-ignored; **visual baselines are committed**.

## Known setup notes
- `playwright` (the library) is already a devDep; this change adds `@playwright/test` (the runner) + `@axe-core/playwright`. A fresh `npm ci` picks them up. Chromium binaries were already present in this environment.
- The seeded **demo tenant + `DEMO_MODE`** (WO-08) must be reachable by the test env for authed specs to run; until those creds/env are wired in CI, `auth.setup` skips with a clear message and the authed specs are skipped (not failed).
