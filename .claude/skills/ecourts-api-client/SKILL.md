---
name: ecourts-api-client
description: Use when integrating Indian court-case data (CNR lookup, cause list by advocate/bar number, hearing/order sync) into an app, or when someone proposes scraping eCourts. Fires on "eCourts", "CNR", "cause list", "court data API", "ecourtsindia", "Vakeel360", "bar registration number", "build our own court database". Codifies the licensed-API-only rule, the CourtDataClient interface, the mock+live provider pattern, and the do-not-scrape/CAPTCHA hard line.
---

How to pull Indian court data legitimately and keep the provider swappable. Battle-tested in LexDriver.

## The hard line (state this when anyone suggests scraping)
All public case data originates from the official eCourts portals (services.ecourts.gov.in, hcservices.ecourts.gov.in). **Every query there is behind a CAPTCHA and the TOU prohibits automated access.** So:
- NEVER scrape those portals. NEVER build or call a CAPTCHA-solver.
- "Build our own database like eCourtsIndia" = becoming a scraping operation. Don't.
- Consume a **licensed court-data API** instead (eCourtsIndia `webapi.ecourtsindia.com`, Bearer auth, ₹200 free signup credits; alt: Vakeel360). Official NIC/eCommittee API access is gated/by-approval — flag as post-MVP, not self-serve.
- If the API can't supply something → surface a **manual-entry** path, never a scraper.

## Architecture: one interface, swappable providers
Define a `CourtDataClient` and return normalized, provider-agnostic types so the app never sees raw provider JSON:
- `getCaseByCNR(cnr)` → parties, advocates, judge, hearings, orders, nextHearingDate
- `searchByAdvocate({name|barNumber, court})` → cases
- `getCauseList({date, name|barNumber, court})` → entries
- `refreshCases(cnrs[])` → bulk live refresh (cap 50/call)
- `getOrder(cnr, orderId)` → pdf + markdown + AI summary

Provide impls behind a factory selected by env (`COURT_DATA_PROVIDER`):
- **MockCourtDataClient** — deterministic (seed off the CNR hash), offline, FREE. Default for dev/test so you never burn credits or depend on network. Essential because cloud/CI IPs are often WAF-blocked by the provider.
- **ECourtsIndiaClient** — live; map `/api/partner/*` endpoints (`/case/{cnr}`, `/search`, `/causelist/search`, `/refresh`, `/order/{cnr}/{id}`). Parse defensively (try multiple likely field names; normalize centrally) and verify field mappings against live responses at deploy.
- Later: `OwnStoreClient` (reads from your own accumulated Postgres — see "own data over time" below).

## "Own your data over time" (the legitimate version)
Day-to-day reads come from YOUR Postgres; the provider is hit only on add-case + scheduled refresh. Grow the owned dataset via manual entry + parsed court-order/cause-list PDFs. Store `source` + `last_synced_at` provenance per row. This makes you mostly self-reliant without scraping.

## Sync jobs (cron)
1. Nightly bulk-refresh tracked CNRs (≤50/call) → diff next hearing date → write hearings/deadlines → queue notifications.
2. Daily cause-list pull per advocate (bar number) for next N days → upsert, link to matter by CNR, surface "listed but not tracked".
3. Deadline computation from a config table of jurisdiction rules (don't hardcode limitation periods).

## Always
Show provenance ("source: eCourts, last refreshed X") + a "not legal advice — verify against the official record" disclaimer on all court data.
