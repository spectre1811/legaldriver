# LexDriver — Task Board

Shared coordination file for build workstreams. Status: `todo` · `claimed` · `blocked` · `done`.
**Rule:** `data-layer` owns migrations + generated DB types; everyone else imports, never redefines.

## Build phases (ship + checkpoint after each — see brief §11)

| Phase | Scope | Done when | Status |
|---|---|---|---|
| **P0 Foundations** | repo, Next.js app, CI, Supabase wired, schema + RLS + types, Auth (email), tenant model | sign in → empty tenant-scoped dashboard | **done ✅** |
| **P1 Case tracking + calendar** | `CourtDataClient` (mock + eCourtsIndia), add case by CNR, nightly refresh cron, hearings on calendar | add a real CNR → see real next hearing | **done ✅** (live verify of eCourts at deploy — VM is WAF-blocked) |
| **P2 Cause list + notices + notifications** | daily cause-list pull by bar number, notice escalation timer, reminders via Resend + in-app | bar number's cause list shows + reminder email fires | **done ✅** |
| **P3 Gmail ingest + parsing** | OAuth connect, incremental fetch, attachment storage, Claude classify, grouped inbox, needs-review queue | connect Gmail → attachment filed under right client/case | **done ✅** (auto-files via local Claude Code CLI, no API key) |
| **P4 Polish + demo** | disclaimers/provenance, a11y pass, demo seed, README + 60s script, deploy + smoke | live URL non-empty, smoke passes | **done ✅** — live at legaldriver.vercel.app |

## Phase 2 (P5–P10) — keyless modules shipped

P5 matter depth · P6 time+expense · P7/P8 client portal (strict RLS isolation) · P10 IPR · documents browser + search · richer AI briefings (worker). Gated: Razorpay, eSign, WhatsApp reminders. See `BACKLOG.md`.

## Phase 3 — platform: gateway + services (modular monolith, contract-first)

Decision: `docs/decisions/2026-06-25-phase3-architecture.md` (services as env-switched modules with mock+live, extractable later — not separate runtimes yet).

| # | Capability | Status |
|---|---|---|
| E7 | **Court Data Gateway v1** — read-through `court_cache` (shared) + provider-health + stale-on-error; richer normalization (acts/judges/orders/detail) | **done ✅** keyless. v2 (multi-provider routing + HITL refresh UI) scaffolded (`court_refresh_request`) |
| E4 | **Rich case detail + similar-case** — acts, orders, detail grid, weighted same-party/advocate/judge/act discovery | **done ✅** keyless |
| E3 | **Case console** — search/filter/sort + saved views | **done ✅** keyless |
| E2 | **Client-first documents** — per-client library + bulk upload + content-hash dedup | **done ✅** keyless |
| E6 | **Lawyer Agent** — grounded retrieval (matter corpus + seeded BNS/BNSS/BSA↔IPC/CrPC/Evidence KB) + cite-or-abstain + Copilot UI; async via worker on keyless prod | **done ✅** keyless. Gated upgrades: pgvector RAG (embeddings key), Indian Kanoon API |
| E1 | **Messaging Gateway** — `MessagingClient` seam + inbound classify-to-matter + inbox UI | **done ✅** (mock); live WhatsApp BSP gated |
| E5 | **Voice/Call Service** — consent-gated manual upload + tag-by-client + recordings UI | **done ✅** (manual); telephony + Indic STT gated |

Migrations 0010 (court/docs/console) + 0011 (services). Smoke: gateway PASS, agent PASS (grounded + cited).

## Workstreams

| Agent | Owns | Status |
|---|---|---|
| infra-scaffold | repo, Next.js app, CI, Vercel + Supabase wiring | todo |
| data-layer | Supabase schema, migrations, RLS, seed, **DB types (sole owner)** | todo |
| court-data | eCourtsIndia client + sync jobs + cause-list pull | todo |
| gmail-ingest | Google OAuth, Gmail fetch, storage, parse + classify | todo |
| daily-driver | calendar, hearings, deadlines, notices + escalation, notifications | todo |
| identity | Supabase auth, tenant model, plan gating | todo |
| qa-deploy | tests, a11y floor, demo seed, deploy + smoke | todo |

## Blockers / waiting on Yash

- [x] Supabase project + 3 keys — provisioned (ref johvrsvaspivmxqvpxcg), schema + RLS live
- [x] eCourtsIndia API token — provided, in .env
- [x] Google OAuth client id/secret — provided, in .env (live Gmail connect is interactive — Yash clicks through)
- [x] ANTHROPIC_API_KEY — not needed: classification uses the local Claude Code CLI backend (OAuth creds). Set a key only for prod/scale speed.
- [x] Vercel — deployed & live at https://legaldriver.vercel.app (env vars set via API; Supabase Auth Site URL pointed at prod)
- [ ] A real Bar Registration Number + a CNR to demo against — needed at P1/P2 checkpoint

## Notes

- Court-data strategy (licensed API now, own datastore over time): `docs/decisions/2026-06-24-court-data-strategy.md`
- P0 verified: new-user trigger → isolated tenant+profile; middleware guards /dashboard; typecheck+build+lint clean.
- P1 verified: `tests/p1_smoke.ts` (RLS sign-in → mock provider → upsertCase → idempotent re-sync); cron `/api/cron/refresh` 401-gated + runs.
- **eCourtsIndia WAF-blocks this AWS VM's IP** — live adapter exercised only at deploy (different egress). Local dev uses `COURT_DATA_PROVIDER=mock`.
- P2 verified: `tests/p2_smoke.ts` (cause-list 13 entries, refresh→6 reminders scheduled, notice→escalated_1, notify sent, REAL email delivered to operator inbox via Resend).
- **Important bug fixed:** Next.js caches `fetch()` by default and supabase-js uses fetch internally → server-side queries were served STALE/empty from the Data Cache. Fixed by giving `admin.ts` + `server.ts` clients a `cache: "no-store"` fetch. Any new server-side supabase client MUST do the same.
- Gotcha: start dev/prod servers as a *background task* (run_in_background) and kill by **listening PID** (`ss -ltnp | grep :3000`). Never `pkill -f next-server` — the pattern matches its own bash command line and self-kills the shell.
- P3 verified: mock ingest auto-filed order→Sharma matter (0.9) + retainer→Acme client (0.9), newsletter→needs-review (0). Classifier backend = local Claude Code CLI (`src/lib/ai/claude-cli.ts`, ~12s/call, tools disabled, in-process only — NOT a public endpoint, to avoid RCE). Toggle via CLASSIFIER_BACKEND (auto|api|cli|off).
- NOTE: the CLI backend needs the `claude` binary + OAuth creds → works locally/self-hosted, NOT on Vercel. For prod classification set ANTHROPIC_API_KEY (backend auto-switches to api). eCourts WAF-block + Gmail consent are also local/interactive concerns.
