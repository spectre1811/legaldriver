# WO-58 · Advocate onboarding: kill the blackhole (honesty + async harvest)

**Date:** 2026-07-06 · **Status:** accepted · **Owner:** S-WO58-opus-20260706 · **Repo:** legaldriver

## Problem (founder, P0)
> "Not able to onboard, the onboarding run fetches no results yet. Nothing gets added. It's just a blackhole. Not able to fetch information for any advocate at all."

## Root cause (traced end-to-end)
The court-data pipeline itself is **healthy** — `GET /advocate/G/4732/1999` on the box returns **5,141 real cases** for M H SOLANKI. The blackhole is entirely on the legaldriver/prod side, in two layers:

1. **The provider is disabled in prod, silently.** `fetchAdvocateCases` runs only providers whose `enabled()` is true. In production `LD_API_KEY` is **not set** (FOUNDER-ACTIONS #1, still open) and no corpus AWS keys are set → **zero providers enabled** → `[]` for every advocate. Worse, the empty-state message (`emptyRosterNote`) then said *"No cases found for this enrolment number"* — which **implies the advocate has none**, the exact opposite of the truth (the source simply isn't wired up).

2. **Cold advocates have no harvest-back.** Post-BP-71, the legaldriver provider reads the warehouse first, then fires the roster refresh **fire-and-forget** (the scraper endpoint is async — `202`, enqueues the roster for the rotating-IP fleet, returns *no cases*). For an advocate we don't already hold (every new signup), the warehouse read is empty **now**, and **nothing ever re-reads the warehouse** once the fleet ingests the roster → the tenant stays permanently empty. Every failure along the way was swallowed by a bare `catch {}` (orchestrator) + `.catch(() => [])` (per provider) → **0 cases, no diagnosis** = "blackhole".

## Decision
Onboarding must **never be a silent blackhole**. Two changes, both non-gated legaldriver code (no schema/RLS/billing):

### 1. Honest diagnostics (anti-blackhole)
- New `fetchAdvocateCasesWithMeta(q)` returns `{ cases, providers, errors }` — **captures** per-provider errors instead of `.catch(()=>[])`-ing them into a blank zero.
- The onboarding **fetch stage** now records an honest note on `onboarding_run.message`, distinguishing three cases that used to all read as a bare "0":
  - **no source configured** (`enabledAdvocateProviders()` empty) → *"Court-data source isn't configured here… an administrator must set LD_API_KEY"* (actionable — surfaces FOUNDER-ACTIONS #1 instead of hiding it);
  - **a source errored** → names the sources, *"we'll keep trying in the background"* (not swallowed — senior-engineer reflex §12);
  - **genuinely nothing yet + a live fetch pending** → *"Fetching your cases… they'll appear as they arrive."*
- The note rides through to the terminal run message (was hard-cleared to `null`), and the toast (`emptyRosterNote`) leads with the "not configured" reason.

### 2. Async harvest-back (cold advocates fill in)
- The live refresh is separated from the warehouse read into `startLiveAdvocateRefresh(q)` — the **only** thing that fires the async fleet refresh (gated on `LD_API_KEY` + a parsed enrolment + a **verified** council; posts the full eCourts tuple `year + bar_state=G + state_code + tier` per scope — never the bare serial, never `GJ`). It's marked `fetch_pending` on the run cursor.
- New `harvestOnboarding(advocateId)` re-reads the **warehouse only** (`live:false` — never a live eCourts burst) and seeds any newly-ingested matters into the tenant, reusing the shared `seedFetchedMatters` helper. The onboarding UI polls it (bounded: 8 passes × 5s, stops after two empty passes, unmount-safe) so a cold advocate's cases land **without a manual re-run** as the fleet stores them in our warehouse.

## Why not an in-request live sync-seed
The box exposes a bounded `&sync=1` inline path, but it triggers a **live eCourts fetch from the box EIP** per onboarding — WAF-sensitive (BP-66) and founder-gated. Per founder decision (2026-07-06), WO-58 stays on the **warehouse + async fleet + harvest-back** path: no in-request burst, aligns with BP-71 (doesn't rebuild its fleet/progress-bar).

## Scope boundary (no collision)
- **Consumes** BP-04's `/advocate/{serial}/refresh` (async `202`) — does not rebuild it.
- **Does not** build BP-71's job-status endpoint / progress-bar, BP-73's 60s-cap drainer, or BP-74's statewide fan-out. WO-58 delivers the **honesty + harvest core** those build on.

## The founder action that flips it live
Code alone can't set a prod secret. **FOUNDER-ACTIONS #1 — set `LD_API_KEY` in Vercel Production + redeploy** — is the switch that turns the ~40k warehoused advocates from "0, silently" into their real rosters. After the WO-58 code merges, an unset key is now *loud and actionable* instead of a silent misleading zero.

## Verification
- `tests/wo58_onboarding_honesty.ts` (offline, in the CI gate): empty-provider honesty, meta shape + error capture, and the `startLiveAdvocateRefresh` gate + exact param tuple (asserts `bar_state=G`, never `GJ`, never the bare serial).
- Full offline suite 41/41 green; typecheck + lint clean.
- Live box read confirmed healthy (SOLANKI → 5,141) — proving the fix is the missing prod key + the harvest, not the pipeline.
