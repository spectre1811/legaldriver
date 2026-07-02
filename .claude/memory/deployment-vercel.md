---
name: deployment-vercel
description: LexDriver is deployed on Vercel (Hobby) at legaldriver.vercel.app — key facts & gotchas
metadata: 
  node_type: memory
  type: project
  originSessionId: 01576ca6-b548-4a76-8884-dbb260336242
---

LexDriver prod: **https://legaldriver.vercel.app** · Vercel project `prj_7XmMbd0nGa92e5rrC5eIOtzDwzaR`
(account yashbahety90), GitHub `spectre1811/legaldriver` (repoId 1279614406), auto-deploys on push to main.
`VERCEL_TOKEN` is in `.env`. Supabase project ref `johvrsvaspivmxqvpxcg`.

**Deploy gotchas hit & fixed (2026-06-24):**
- "Failed to load" = no env vars in Vercel (build OK, runtime 500 because middleware needs
  Supabase env). Fix: set all env via `POST /v10/projects/{id}/env` (NEXT_PUBLIC_* must be set
  before build → redeploy after). 14 vars set incl. prod overrides: `APP_BASE_URL=https://legaldriver.vercel.app`,
  `COURT_DATA_PROVIDER=ecourtsindia` (live court data IS reachable from Vercel — WAF block was VM-only),
  `CLASSIFIER_BACKEND=off` (no claude binary/API key on Vercel → mail goes to needs-review).
- Hobby allows **daily-only** crons → sub-daily `vercel.json` schedules are rejected
  (`cron_jobs_limits_reached`). vercel.json is now all-daily; high-frequency jobs run via
  Supabase **pg_cron + pg_net** hitting the cron endpoints (see [[../../Projects/legaldriver/docs/decisions/2026-06-24-cron-scheduling.md]] / supabase/scheduled-jobs.sql).
- Supabase Auth **Site URL** defaulted to localhost:3000 → confirmation emails linked to localhost.
  Fixed via Management API `PATCH /v1/projects/{ref}/config/auth` (site_url + uri_allow_list = prod + localhost).

**Still open (need real inputs / decisions):** a real CNR to verify the live eCourts field
mappings (currently unverified — synthetic CNRs return nothing); add prod Gmail callback
`https://legaldriver.vercel.app/api/google/callback` in the Google OAuth client; prod doc
classification is off unless an ANTHROPIC_API_KEY is set ([[classifier-local-claude-cli]]).
