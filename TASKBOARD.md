# LexDriver — Task Board

Shared coordination file for build workstreams. Status: `todo` · `claimed` · `blocked` · `done`.
**Rule:** `data-layer` owns migrations + generated DB types; everyone else imports, never redefines.

## Build phases (ship + checkpoint after each — see brief §11)

| Phase | Scope | Done when | Status |
|---|---|---|---|
| **P0 Foundations** | repo, Next.js app, CI, Supabase wired, schema + RLS + types, Auth (email), tenant model | sign in → empty tenant-scoped dashboard | **done ✅** |
| **P1 Case tracking + calendar** | `CourtDataClient` (mock + eCourtsIndia), add case by CNR, nightly refresh cron, hearings on calendar | add a real CNR → see real next hearing | **done ✅** (live verify of eCourts at deploy — VM is WAF-blocked) |
| **P2 Cause list + notices + notifications** | daily cause-list pull by bar number, notice escalation timer, reminders via Resend + in-app | bar number's cause list shows + reminder email fires | todo |
| **P3 Gmail ingest + parsing** | OAuth connect, incremental fetch, attachment storage, Claude classify, grouped inbox, needs-review queue | connect Gmail → attachment filed under right client/case | todo |
| **P4 Polish + demo** | disclaimers/provenance, a11y pass, demo seed, README + 60s script, deploy + smoke | live URL non-empty, smoke passes | todo |

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
- [ ] Google OAuth client id/secret — **Yash will provide later** (needed at P3; Gmail stubbed until then)
- [ ] Vercel account link — deferred to P4
- [ ] A real Bar Registration Number + a CNR to demo against — needed at P1/P2 checkpoint

## Notes

- Court-data strategy (licensed API now, own datastore over time): `docs/decisions/2026-06-24-court-data-strategy.md`
- P0 verified: new-user trigger → isolated tenant+profile; middleware guards /dashboard; typecheck+build+lint clean.
- P1 verified: `tests/p1_smoke.ts` (RLS sign-in → mock provider → upsertCase → idempotent re-sync); cron `/api/cron/refresh` 401-gated + runs.
- **eCourtsIndia WAF-blocks this AWS VM's IP** — live adapter exercised only at deploy (different egress). Local dev uses `COURT_DATA_PROVIDER=mock`.
- Gotcha: kill dev/prod servers with `pkill -9 -f next-server` (killing the npm wrapper leaves a stale next-server on :3000).
