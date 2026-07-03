# Legaldriver — Project Context

A legal "daily driver" for advocates/firms: track court cases by CNR, see hearings +
jurisdiction-aware deadlines + the advocate cause list on one calendar, run legal-notice
escalation with reminders, and ingest Gmail so emails + attachments are auto-filed and
parsed against the right client/case. Full spec in `legal-mvp-build-brief.md`.

## Mukadma — operating rules (always in force, even without the kickoff prompt)
This repo is part of **Mukadma** (Indian legal-tech). The full ruleset + current work live in the exec
pack at `~/personal/legalmarketplace/plan/exec/`: **`00-OPERATING-PROTOCOL.md`** (governs everything),
`TRACKER.md` (in-flight), `BACKLOG.md` §A (what to pull next), `KICKOFF.md`, **`LEARNINGS.md`**
(cross-agent gotchas — read before non-trivial work). Facts/numbers come **only** from
`plan/context/00-INPUTS.md` — never invent them.
- **Plan-linked work only** — every task ties to a work order + a `TRACKER.md` row; claim it (🟡 + session id) before editing.
- **Founder-gated → STOP + present before merge:** DB migrations, RLS/tenancy, auth, billing/payments.
- **Gates before "done":** `npm run typecheck` + `lint` + `build` + the relevant `tests/*.ts` — all green. No "done" with red/skipped.
- **Tests + types + docs in the SAME change;** update `TRACKER.md` + append `SESSION-LOG.md` per wave; promote reusable gotchas to `LEARNINGS.md`.
- **Small, reviewed, in waves** — branch per work order (`wt/<id>`); a second agent reviews (author never self-approves).
- **Cheapest capable model** — Sonnet by default; Opus only for schema/RLS/security/product-wide-interface (say so).
- **No hacks** — diagnose the root cause; never disable a gate, swallow an error, or silently degrade.
- **Deploy discipline:** `main` does **NOT** auto-deploy to Vercel yet (WO-09 pending) → run `vercel deploy --prod --token=$VERCEL_TOKEN` after merging, or the change isn't live. Env/crons are on the Vercel project.
- **Parallel sessions run concurrently** — touch only your work order's files; edit only your own TRACKER/SESSION-LOG rows; flag shared-config (package.json/CI) changes first.

## Stack

Next.js 14 (App Router, TS) · Supabase (Postgres + RLS, Auth, Storage) · eCourtsIndia behind
a `CourtDataClient` interface · Gmail API (gmail.readonly) · Claude API for doc classify ·
Resend for email. Deploy on Vercel (P4).

## Repo map

| Path | What |
|---|---|
| `src/app/` | App Router pages. `login/`, `auth/` (callback+signout), `dashboard/` (overview, cases, calendar, notices, inbox). |
| `src/lib/supabase/` | `client.ts` (browser), `server.ts` (RLS server), `admin.ts` (service-role, RLS-bypassing — server-only), `middleware.ts` (session refresh + route guard). |
| `src/lib/db/database.types.ts` | **Generated** from the live schema. Single source of DB types — import, never hand-edit. Regenerate with `npm run db:types` (or the Management API). |
| `supabase/migrations/` | SQL migrations. `0001_init.sql` = schema + RLS + new-user bootstrap trigger. |
| `TASKBOARD.md` | Phase + workstream status. |

## Non-negotiable conventions

1. **Multi-tenant isolation via RLS on every tenant-owned table**, deny-by-default, keyed to
   `current_tenant_id()`. Never add a tenant-owned table without its 4 RLS policies. The
   service-role (`admin.ts`) bypasses RLS — only in trusted server jobs, and always filter
   by `tenant_id` manually there.
2. **Court data via the ecourts-scraper platform's internal API.** Scraping is the **settled org
   data strategy** (INPUTS §4; founder decision 2026-07-03) — the old "licensed-API-only / never
   scrape / never build a CAPTCHA solver" hard line is **superseded**. legaldriver itself consumes
   the platform's `/v1` internal API behind the `CourtDataClient` interface; the ecourts-scraper
   platform does the collection (CAPTCHA-free eCourts **mobile API** as the primary path, with a
   CAPTCHA web route only for district order PDFs). Provenance + "verify against the official
   record" disclaimer stay mandatory (conv. #3). See
   `docs/decisions/2026-07-03-scraper-sync-contract.md` (supersedes `2026-06-24-court-data-strategy.md`).
3. **Provenance + disclaimer on all court data**: store `source` + `last_synced_at`, show
   "source: eCourts, last refreshed X" and "not legal advice — verify against the official record".
4. **No PII in logs.** Never log email bodies, tokens, or client data. OAuth refresh tokens are
   stored encrypted (Supabase Vault), referenced by `refresh_token_ref` — never in plaintext/logs.
5. **LLM infers, deterministic code verifies/files.** Claude classifies documents; it never
   auto-deletes or auto-sends. Low-confidence → `needs_review` queue.
6. **Secrets from env only**, never hardcoded. `.env.example` lists every key. `.env` is git-ignored.
7. **Providers behind interfaces**: `CourtDataClient`, `MailClient`, `Notifier`. Swappable impls
   (incl. a free mock provider for dev so we don't burn API credits).

## Build phases

See `TASKBOARD.md`. Ship + checkpoint after each: run it, show Yash, wait for go-ahead.
P0 foundations ✅ · P1 case tracking + calendar · P2 cause list + notices + notifications ·
P3 Gmail ingest + parsing · P4 polish + demo + deploy.

## Conventions inherited from the operator's setup

Per-project CLAUDE.md + TASKBOARD; GitHub Actions CI; `.env` git-ignored; skill authoring via
the skill-smith workflow (new skills at `~/.claude/skills/`); model routing Sonnet-default,
Opus for hard architecture.
