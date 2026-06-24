# LexDriver — Project Context

A legal "daily driver" for advocates/firms: track court cases by CNR, see hearings +
jurisdiction-aware deadlines + the advocate cause list on one calendar, run legal-notice
escalation with reminders, and ingest Gmail so emails + attachments are auto-filed and
parsed against the right client/case. Full spec in `legal-mvp-build-brief.md`.

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
2. **Court data only from a licensed API** (eCourtsIndia). NEVER scrape services.ecourts.gov.in
   / hcservices.ecourts.gov.in, NEVER build/call a CAPTCHA solver. Missing data → manual-entry
   path. See `docs/decisions/2026-06-24-court-data-strategy.md`.
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
