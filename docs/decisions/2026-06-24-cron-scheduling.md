# Cron scheduling: Supabase pg_cron drives the endpoints (beats Vercel Hobby limits)

**Date:** 2026-06-24 · **Status:** in place

## Problem
Vercel **Hobby** plan only runs cron jobs on a **daily** cadence. Legaldriver needs higher
frequency: reminders (notify) ~every 15 min, notice escalation hourly, Gmail ingest ~30 min.
Sub-daily schedules in `vercel.json` are rejected at deploy with `cron_jobs_limits_reached`.

## Options considered
1. **Upgrade to Vercel Pro** ($20/mo) — native sub-daily crons. Cleanest if paying.
2. **External scheduler hits our endpoints** — GitHub Actions schedule, cron-job.org, Upstash QStash.
3. **Supabase `pg_cron` + `pg_net`** — schedule in the DB we already own; `pg_net` makes the
   HTTP call to our Vercel cron endpoints at any cadence. **Chosen** — free, no extra service,
   robust, and the endpoints are already `CRON_SECRET`-gated.

## What's in place
- `vercel.json` keeps **daily** schedules for all 5 jobs (allowed on Hobby) as a backstop.
- `pg_cron` adds the real cadence by calling the endpoints via `pg_net`:
  - `ld_notify` → `*/15 * * * *` → `/api/cron/notify`
  - `ld_escalate` → `0 * * * *` → `/api/cron/escalate`
  - `ld_gmail` → `*/30 * * * *` → `/api/cron/gmail`
- Each job: `select net.http_get(url:=BASE||path, headers:=jsonb_build_object('Authorization','Bearer '||SECRET), timeout_milliseconds:=30000);`
- Verified: `net._http_response` shows `status_code 200` from the live endpoint.

## Reproduce
Run `supabase/scheduled-jobs.sql` against the project (replace `__CRON_SECRET__` and the base
URL). **The real secret is NOT committed** — it lives only in the `cron.job` table (DB-internal).
Manage: `select * from cron.job;` · `select cron.unschedule('ld_notify');` ·
inspect runs: `select * from cron.job_run_details order by start_time desc limit 20;`.

## Upgrade path
If moving to Vercel Pro, set the sub-daily schedules directly in `vercel.json` and unschedule the
`pg_cron` jobs to avoid double-runs (the work is idempotent, so overlap is harmless meanwhile).
