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

## Reconciling the repo "never scrape" posture (CLAUDE.md conv. #2)

legaldriver's CLAUDE.md and the `court-data-own-datastore-direction` memory state a hard line:
*never scrape eCourts, never build/call a CAPTCHA solver, court data only via a licensed API behind
`CourtDataClient`.* This holds under WO-01: **legaldriver still never scrapes.** It calls an
internal REST API with a key and normalizes the response behind the existing `CourtDataClient`
interface — exactly the "own your data over time" path the `ecourts-api-client` skill describes
(the `OwnStore` provider). The scraping/CAPTCHA concerns live entirely in the ecourts-scraper
platform, which is the org's settled data strategy (INPUTS §4/§9). No CAPTCHA code, portal URL, or
solver enters the legaldriver repo. **Follow-up:** once accepted, update legaldriver CLAUDE.md
conv. #2 to name the internal-API (`LegalDriverClient`) provider alongside the licensed one, so the
repo posture and this contract agree.

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
