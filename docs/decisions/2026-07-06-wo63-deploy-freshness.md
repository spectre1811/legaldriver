# WO-63 · Deploy pipeline — build-SHA on /api/health + a deploy-freshness alarm

**Date:** 2026-07-06 · **Status:** accepted · **Session:** S-WO63-opus-20260706
**Priority:** P0 (from the 2026-07-06 onboarding deep-dive) · **Branches:** `wt/WO-63` in **legaldriver** + **peshi-search** · **Gated?** no (no migration; no auth/RLS/billing). One founder **$ decision** surfaced (Vercel Pro), not blocking.

## Why (the incident)
For days the fleet merged fixes to `main` but **production never redeployed**. On 2026-07-06 prod sat
**8+ commits behind** (`6e0c4b9` while `main` was `a9cefd1`) — so WO-61's onboarding fix and other
merged WOs **were not live at all**. The founder kept seeing old, broken behaviour while the board read
"DONE + DEPLOYING". Root cause (FOUNDER-ACTIONS #2c): Vercel **Hobby** deploy-quota stall under the
automerge fleet — the deploy-*creation* stopped firing on merge. The killer wasn't just the stall; it
was that **nothing compared prod's running SHA to `main`**, so a total deploy outage produced **zero
signal**. "Is prod current?" had no answer short of poking the Vercel API by hand.

## Decisions

### 1. Expose the running build SHA on a public `/api/health` (both apps)
`GET /api/health` → `{ ok, service, sha, shaShort, ref, env, region, time }`, reading Vercel's
build-injected `VERCEL_GIT_COMMIT_SHA`. "Is prod running the latest `main`?" is now **one curl**:
`curl -s https://legaldriver.vercel.app/api/health | jq .sha` vs `git rev-parse origin/main`.
- **Public + secret-free on purpose.** A health/version probe must be reachable by an uptime monitor
  without a key, and a 40-char commit hash of a private repo is not sensitive. Nothing secret is echoed.
- `dynamic = "force-dynamic"` so it reads runtime env every hit (never a statically-cached SHA).

### 2. A deploy-freshness alarm cron (`/api/cron/deploy-freshness`, both apps)
The cron runs **inside** the production deployment, so `VERCEL_GIT_COMMIT_SHA` there **is** the live prod
SHA. It compares that to `origin/main` HEAD via GitHub's **compare** API (`compare/{prodSha}...main` —
one call yields `ahead_by` = commitsBehind, `commits[0]` = oldest un-deployed → age, `commits[last]` =
main HEAD) and classifies:
- **current** (0 behind) → `ok`.
- **behind but within a deploy-grace window** (default 20 min, `DEPLOY_GRACE_MIN`) → `ok` — the newest
  merge is probably still building; don't cry wolf.
- **behind past the grace window** (or unknown age) → **`stale` ALARM**.
- **prod or main SHA unknown** (local build / no GitHub token) → `unknown`, **never an alarm** — a
  missing input must not manufacture a false positive.

**legaldriver** writes the verdict to `court_provider_health` under provider **`deploy-freshness`** (the
same table + `getProviderHealth()` surface the WO-64 canary uses — WO-64 explicitly left room for this)
and returns a red **503** on alarm. **peshi-search** is stateless/DB-less, so its cron logs the alarm
(`console.error`, PII-free) + returns **503** — the HTTP status is the alarm channel an external uptime
monitor pings. Both crons double as **on-demand probes**: an external monitor can hit them at a tighter
cadence than the daily cron for real "> N minutes behind" detection (Vercel **Hobby forbids sub-daily
cron schedules** — WO-64 learned this the hard way, so the scheduled run is daily `0 8 * * *`).

### 3. Design: pure kernel + thin network shell (mirrors the WO-64 canary)
`evaluateFreshness` (verdict from already-fetched facts) and `parseCompareResponse` (GitHub payload →
facts) are **pure, Date-free, network-free** and fully unit-tested offline (`wo63_deploy_freshness` in
legaldriver's offline gate; `deploy-freshness.test` in peshi's `npm test`). `fetchMainLag` /
`checkDeployFreshness` are the thin I/O shells. peshi keeps its **own copy** of the kernel (no
cross-repo imports — the standalone-public-app guardrail).

## Env / ops (graceful — ships LIVE before any of these are set)
- **`GITHUB_FRESHNESS_TOKEN`** (or `GITHUB_PAT`) — a read-only token so the cron can read a **private**
  repo's `main` HEAD. Absent → the cron reports `unknown` (honest, non-alarming), never crashes.
- **`CRON_SECRET`** — legaldriver already has it (all crons Bearer-gated). peshi gates **only if set**
  (unset → allow; the endpoint is read-only and returns just SHAs + a lag count).
- **`DEPLOY_GRACE_MIN`** — optional override of the 20-min grace window.
- Surfaced to the founder (FOUNDER-ACTIONS): **Vercel Pro** (removes the Hobby deploy cap + gives the
  canary/freshness crons room to run more than daily + per-PR previews) **vs** a controlled-cadence
  batch-deploy to stay on Hobby. This is a **$ decision**, not a blocker — the alarm ships regardless and
  will now *surface* a stall instead of hiding it.

## What this does NOT do (honest residuals → §D)
- It **detects** a stalled deploy; it does not **auto-fix** the Hobby quota stall — that's the founder's
  Vercel-Pro-vs-cadence call (the durable `merge→deploy→live` guarantee rides that decision).
- The alarm→notification last-mile (email/Telegram on a `deploy-freshness` red row) piggybacks on
  whatever consumes `court_provider_health`; a dedicated push is a §D follow-up (pairs with WO-60 Hermes).
- Live end-to-end proof of the *stale* path (forcing prod behind main) isn't run on prod to avoid
  deliberately stalling a deploy; it's offline-proven + the *fresh* path is live-verifiable post-merge.

## Gates
- **legaldriver:** `typecheck` + `lint` + `build` + offline `wo63_deploy_freshness` (24 checks) — all green.
- **peshi-search:** `typecheck` + `lint` + `npm test` (`deploy-freshness.test`, 10 checks) + `build` +
  EN/HI i18n parity (new `status.build`/`buildUnknown` keys) — all green.
