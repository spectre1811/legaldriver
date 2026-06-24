# LexDriver

A legal "daily driver" for advocates and firms: track court cases by CNR, see hearings +
jurisdiction-aware deadlines + your advocate cause list on one calendar, run legal-notice
escalation with reminders, and ingest Gmail so emails and attachments are auto-filed and
parsed against the right client/case.

> **Not legal advice.** All court data is informational — verify against the official record.
> Court data is sourced from a licensed court-data API (eCourtsIndia), never scraped from the
> official portals.

## Stack

- **App + API:** Next.js 14 (App Router, TypeScript) on Vercel
- **DB / Auth / Storage:** Supabase (Postgres + RLS, Auth, Storage, cron)
- **Court data:** eCourtsIndia REST API behind a `CourtDataClient` interface
- **Email ingest:** Google OAuth (`gmail.readonly`) + Gmail API
- **Doc parsing:** pdf-parse/pdfjs (+ tesseract.js OCR) → Claude API for classify/extract
- **Notifications:** Resend (email) + Supabase Realtime (in-app)

## Status

🚧 Bootstrapping. Build phases tracked in [`TASKBOARD.md`](./TASKBOARD.md).

## Setup

1. `npm install`
2. Copy `.env.example` → `.env.local` and fill in keys (see `.env.example` for the full list).
3. `npm run dev`

Full setup + a 60-second demo script will land here as phases ship.
