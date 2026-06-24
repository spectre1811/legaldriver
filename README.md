# LexDriver

A legal "daily driver" for advocates and firms: track court cases by CNR, see hearings +
jurisdiction-aware deadlines + your advocate cause list on one calendar, run legal-notice
escalation with reminders, and ingest Gmail so emails and attachments are auto-filed and
parsed against the right client/case.

> **Not legal advice.** All court data is informational — verify against the official record.
> Court data is sourced from a licensed court-data API (eCourtsIndia), never scraped from the
> official portals.

**Live demo:** https://legaldriver.vercel.app · **Repo:** https://github.com/spectre1811/legaldriver

## Features (shipped)

- **Case tracking** — add a case by CNR; details + hearing history fetched and kept fresh by a nightly sync. Provenance (`source` + `last refreshed`) on every record.
- **Calendar** — hearings + the advocate's cause list on a month grid + agenda.
- **Notices + escalation** — create a notice with a response-due date; a state machine
  (`awaiting_response → escalated_1 → escalated_2 → closed`) advances automatically when overdue.
- **Notifications** — T-3 / T-1 / day-of reminders for hearings & deadlines, plus notice
  escalations, delivered in-app and by email (Resend). Idempotent send-worker.
- **Gmail ingest** — connect Gmail (`gmail.readonly`), incrementally fetch messages +
  attachments, store them, classify with Claude, and **auto-file by client/case** (low
  confidence → needs-review queue). Inbox grouped by client/case.

## Stack

- **App + API:** Next.js 14 (App Router, TypeScript) on Vercel
- **DB / Auth / Storage:** Supabase (Postgres + RLS, Auth, Storage, Vault)
- **Court data:** eCourtsIndia REST API behind a swappable `CourtDataClient` (mock + live)
- **Email ingest:** Google OAuth (`gmail.readonly`) + Gmail API
- **Doc parsing:** pdf-parse (+ OCR fallback flagged) → Claude for classify/extract
- **Notifications:** Resend (email) + Supabase Realtime (in-app)

## Architecture notes

- **Multi-tenant isolation via Postgres RLS** on every tenant-owned table, deny-by-default,
  keyed to `current_tenant_id()`. A trigger bootstraps a tenant + owner profile per new user.
- **Provider seams:** `CourtDataClient` (mock/eCourtsIndia), `MailClient` (mock/Gmail),
  classifier backend (API / local Claude CLI / off) — all swappable by env.
- **Classifier backend** (`CLASSIFIER_BACKEND`): `api` uses the Anthropic API with structured
  outputs; `cli` uses the local Claude Code CLI (OAuth creds, **no API key** — local/self-hosted
  only, not Vercel); `off` routes everything to needs-review. See `docs/decisions/`.
- **Secrets:** OAuth refresh tokens stored encrypted in Supabase Vault; `.env` git-ignored;
  no PII/email bodies in logs.

## Setup (local)

1. `npm install`
2. Copy `.env.example` → `.env` and fill in keys (Supabase x3 required; others optional —
   see comments in `.env.example`). Court data defaults to a free mock provider; classification
   defaults to the local `claude` CLI if no `ANTHROPIC_API_KEY` is set.
3. `npm run dev` → http://localhost:3000
4. (optional) Seed demo data: `npx tsx scripts/seed-demo.ts`

## Database

Migrations live in `supabase/migrations/`. Apply via the Supabase CLI (`supabase db push`) or
the Management API. Regenerate types after any migration: `npm run db:types`.

## 60-second demo script

1. **Sign in** at `/login` (demo: `demo@lexdriver.test` / `demo-pass-1234`, or sign up). You land
   on a tenant-scoped dashboard. *(If empty, run the seed script above.)*
2. **Cases** → "Add case by CNR" → paste any 16-char CNR → it fetches details and shows the
   **next hearing date** with provenance. Open the case for parties + hearing history + "Refresh".
3. **Calendar** → the hearing (blue) and the advocate's cause-list item (amber) appear on the month.
4. **Settings** → add an advocate with a Bar number → the daily cause-list pull targets it.
5. **Notices** → create a notice with a past response-due date → it's `awaiting_response`; the
   escalation cron advances it to `escalated_1` and queues a notification.
6. **Notifications** → see scheduled T-3/T-1/day-of reminders; a reminder email fires via Resend.
7. **Inbox** → "Simulate ingest (demo mailbox)" → a court order auto-files under the matter and a
   retainer under the client; a newsletter lands in **needs-review** for one-click confirm.

## Deploy

GitHub → Vercel (auto-deploy on push to `main`). Env vars set in the Vercel project. Cron jobs in
`vercel.json` (daily on the Hobby plan). Supabase migrations applied out-of-band.

**Notes for the hosted demo:**
- Classification on Vercel = `CLASSIFIER_BACKEND=off` (no `claude` binary / API key there) →
  ingested mail goes to the needs-review queue. Set `ANTHROPIC_API_KEY` to enable auto-classify in prod.
- Live court data (`COURT_DATA_PROVIDER=ecourtsindia`) works on Vercel (its IP isn't WAF-blocked);
  field mappings are best-effort and should be spot-checked against live responses.
- Gmail connect is interactive (Google consent in a browser); add the prod callback URL
  `https://legaldriver.vercel.app/api/google/callback` to the Google OAuth client.
