# Scraper → platform sync contract: internal `/v1` API (WO-01)

**Date:** 2026-07-03 · **Status:** **proposed — pending founder review** (sync-contract gate; do NOT merge before sign-off) · **Work order:** WO-01 · **Plan ref:** 02-DATA §3, §11

## Context

legaldriver (the tenant SaaS) and ecourts-scraper (the public court-data platform) were not
wired through a stable, versioned surface. The on-demand read path already existed and was
validated in Gujarat (`LegalDriverClient` → `getCaseCached` → `upsertCase`), but it consumed the
scraper's **unversioned** legacy paths (`/case/{cnr}`, `/cause-list`) and responses carried **no
`schema_version`**. 02-DATA §3 requires a versioned internal API (`/v1/cases/{cnr}`,
`/v1/cause-lists`) that also becomes the future paid API, with `schema_version` on every response.

## Decision

1. **Mechanism = (b) internal sync API** (from 02-DATA §3's a/b/c). Rejected: (a) FDW/replica from
   Supabase → court DB (couples the two datastores, risks tenant data crossing the boundary) and
   (c) nightly mirror tables (staleness + duplication). (b) keeps one owner per datastore, and the
   same HTTP surface productises later as the paid API — zero extra build.
2. **Versioned `/v1` surface**, added to `api/main.py` as a thin, additive layer delegating to the
   existing read-through service functions:
   - `GET  /v1/cases/{cnr}`            (`?refresh=true`)
   - `POST /v1/cases/{cnr}/refresh`
   - `GET  /v1/cases/{cnr}/orders`     (`?text=&fetch=`)
   - `GET  /v1/cause-lists?court_id=&date=`
   Legacy unversioned paths stay working (browse helpers in `legaldriver-api.ts` depend on them).
3. **`schema_version` on every `/v1` response** (currently `"1.0"`). Semver policy: **MAJOR** bumps
   only on a breaking response change (removed/renamed field or type change); additive fields do
   **not** bump it. The consumer pins the MAJOR it was built against (`SYNC_SCHEMA_MAJOR = 1`) and
   **warns once on a MAJOR mismatch** — it never hard-fails a lawyer's add-case on a version skew.
4. **legaldriver consumes `/v1`** for the four sync-contract calls (`getCaseByCNR`, `refreshCases`,
   `getCauseList`, `getOrder`). Provenance (`source` + `last_synced_at`) is already stored and shown
   with the "verify against the official record" disclaimer; PDFs stay behind the stable stream
   endpoint (never a persisted presigned URL).

## The "never scrape" posture — OVERRIDDEN by founder decision (2026-07-03)

legaldriver's CLAUDE.md conv. #2 and the `court-data-own-datastore-direction` memory previously
stated a hard line: *never scrape eCourts, never build/call a CAPTCHA solver, court data only via a
licensed API.* **The founder has overridden that line (2026-07-03): scraping is the settled org data
strategy (INPUTS §4).** The `ecourts-scraper` platform is our first-party court-data store,
collected primarily via the CAPTCHA-free eCourts **mobile API** (with a CAPTCHA web route only for
district order PDFs). legaldriver consumes that platform's `/v1` internal API behind the
`CourtDataClient` interface — no scraping/CAPTCHA code lives in the legaldriver repo itself; the
collection concerns live in the platform. **Applied this change:** legaldriver CLAUDE.md conv. #2 +
the `court-data-own-datastore-direction` memory updated to supersede the old rule (this doc
supersedes `2026-06-24-court-data-strategy.md`). **Follow-up:** the `ecourts-api-client` skill
(`.claude/skills/`) still recites the old hard line — refresh it in a follow-up so the skill agrees.

## Scope / non-goals

- Cause-list **data ingestion** (populating the scraper `cause_list` table from the mobile API) is
  **WO-01 Wave 3** — the `/v1/cause-lists` read endpoint currently serves an empty table until then.
- Order/judgment **text extraction auto-trigger** is **Wave 4**.
- No DB migration, no RLS change. A tenancy test (`tests/wo01_tenancy_sync.ts`) proves synced cases
  stay tenant-scoped; a contract test (`tests/wo01_sync_contract.ts`) locks the client ⇄ `/v1` shape.

## Consequences

- The internal API is now the single seam between the two systems and the seed of the paid API.
- Consumers get a breaking-change signal (`schema_version`) instead of silent field drift.
- Founder review required on this contract before merge (WO-01 guardrail + protocol §1.3).
