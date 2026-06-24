# LexDriver — Task Board

Shared coordination file for build workstreams. Status: `todo` · `claimed` · `blocked` · `done`.
**Rule:** `data-layer` owns migrations + generated DB types; everyone else imports, never redefines.

## Build phases (ship + checkpoint after each — see brief §11)

| Phase | Scope | Done when | Status |
|---|---|---|---|
| **P0 Foundations** | repo, Next.js app, CI, Vercel + Supabase wired, schema + RLS + types, Auth (email + Google), tenant model, seed | sign in → empty tenant-scoped dashboard | claimed |
| **P1 Case tracking + calendar** | `CourtDataClient`, add case by CNR, advocate search, nightly refresh, hearings on calendar | add a real CNR → see real next hearing | todo |
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

- [ ] Supabase project + 3 keys
- [ ] eCourtsIndia API token
- [ ] Google OAuth client id/secret (consent screen in Testing, Yash added as test user)
- [ ] Vercel account link (or decide: deploy later)
- [ ] A real Bar Registration Number + a CNR to demo against
