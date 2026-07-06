# WO-65 · Onboarding must import the FULL roster (cached warehouse read, not a live re-fetch)

**Date:** 2026-07-06 · **Status:** shipped · **Session:** S-WO65-opus-20260706
**Priority:** P1 (from the 2026-07-06 onboarding deep-dive, `exec/ONBOARDING-FLOW-ANALYSIS-2026-07-06.md`)
**Branch:** `wt/WO-65` · **Gated?** no (no migration — `roster_total` is a new key in the existing `onboarding_run.counts` jsonb)

## Why
With the WO-58/WO-64 auth blockers fixed, a real onboarding run of `G/702/2020` seeded only **80** of
the advocate's **257** warehouse cases and the **enrich** stage stalled at 0 if the user left the page.
Both had the same root cause: two demo-era design choices.

1. **`seedFetchedMatters` capped at 80** — a token slice, not the practice.
2. **Enrich did a LIVE per-CNR eCourts re-fetch** (`court.refreshCases` → `POST /v1/cases/{cnr}/refresh`)
   "to reflect the current record" — 80+ slow (3–6s) round-trips, chunked 3-at-a-time, driven from the
   browser tab (BP-73). Slow, WAF-risky, and dead when the tab closes.

But the warehouse **already holds the full detail** — `GET /v1/cases/{cnr}` (refresh=false) returns
straight from the read replica (`_source:cache`) for a warehoused case: 5 hearings, parties, filing/FIR/
coram/district. So onboarding was **re-fetching live what we already have**, buying nothing (a "live"
copy at onboarding-second-0 is stale by tomorrow anyway; freshness is the nightly refresh cron's + an
on-open refresh's job).

## What changed (legaldriver only — no box change needed)
- **Enrich = cached warehouse read.** `stepEnrich` now reads each CNR via `getCaseCached` (the cached
  `GET /v1/cases/{cnr}`), **not** `court.refreshCases`. For a warehoused advocate every read is a replica
  cache hit → **no live eCourts burst**. The chunk runs **concurrently** (cheap reads) and the predicate
  targets **thin** matters (`last_synced_at IS NULL` — seeded-but-not-detailed; `upsertCase` stamps it),
  so it enriches active **and** disposed cases to full detail and an idempotent re-run naturally skips
  what's done. `ENRICH_CHUNK` 3→5 (a cached chunk is ~0.3s, not ~15s of live reads) so a ~257-case
  roster finishes in a **single** server invocation, but the BP-73 resumable machinery is untouched (a
  12-CNR roster still spans ≥3 chunks, so the mid-chunk budget-stop stays exercised).
- **Full roster seeds, in bulk.** `seedFetchedMatters` cap 80 → `SEED_MAX` (2000), and it now does one
  existence query per 300 CNRs + chunked bulk inserts (with a per-row fallback on a bulk collision)
  instead of two round-trips per case — so 257 (or more) imports fast and complete, idempotently.
- **Honest coverage UX.** The fetch stage records `roster_total` (M = the advocate's full roster size,
  stable across re-runs — `cases_fetched` reads 0 on a re-run). New pure `onboardingCoverage()` +
  the updated `onboardingCountsSummary()` render "M cases on file · N of M detailed" (and "all details
  in" when E≥M); the run-details grid leads with a **Cases on file** stat; the terminal summary reports
  the roster total, and only appends the "why 0?" note when we genuinely found nothing (never after a
  re-run of an already-imported advocate). "Your practice" already shows the true tenant matter count.

## Bounds & backstop (nothing silently dropped)
`ENRICH_MAX` = 500 caps how many thin matters onboarding details per advocate; `SEED_MAX` = 2000 caps
the seed. Both are generous safety bounds so one stage can't blow the 60s function budget. Anything
beyond them is **stalest-first** in the nightly `/api/cron/refresh` (thin = `last_synced_at IS NULL` →
prioritized), so a very large roster completes over the next cron tick rather than being lost. The 257
target is well within bounds.

## Scope note
Cold advocates (not yet in the warehouse) remain the separate fleet-drain path (BP-71/72/74) — this WO
is the warehouse-held case. The client BP-73 drain + WO-58 harvest still run, but now do far less: enrich
is cheap enough to finish server-side, so the drain is a safety net, not the mechanism.

## Gates
typecheck + lint + build + **53/53 offline** (new `tests/wo65_full_roster.ts` — 17 checks: full-roster
seed, idempotency, partial-existing, in-batch dedupe, bulk→per-row fallback, coverage math, summary
grammar) + i18n parity 1731=1731. No migration, no dependency, no gated surface.

## Not verified locally
A live click-test of a real 257-case onboarding run (cases land + calendar hearings + "N of M" banner)
needs a live LD-API run + demo creds → owed to the ui-qa-tester (BACKLOG §D4 verify-next).
