---
name: court-data-own-datastore-direction
description: "Yash wants LexDriver to build its own court-data store over time, not depend on eCourtsIndia"
metadata: 
  node_type: memory
  type: project
  originSessionId: 01576ca6-b548-4a76-8884-dbb260336242
---

Yash asked twice (2026-06-24) about avoiding the paid eCourtsIndia provider and "building our
own database like them." Direction: depend on the licensed API for MVP/demo, but grow a
first-party owned datastore over time and reduce reliance on the reseller.

**Why:** cost + ownership; he doesn't want to be locked to eCourtsIndia long-term.

**SUPERSEDED 2026-07-03 (founder decision):** the "own datastore" direction is now **realized** —
the `ecourts-scraper` platform IS our first-party court-data store, collected primarily via the
CAPTCHA-free eCourts **mobile API**. The old "never scrape / never build a CAPTCHA solver" hard
line is **overridden**: scraping is the settled org data strategy (INPUTS §4).

**How to apply:** legaldriver stays behind the `CourtDataClient` interface and consumes the
platform's `/v1` internal API (`LegalDriverClient`) — day-to-day reads come from our own Postgres
cache; the provider is hit on add-case + scheduled refresh. Provenance (`source` +
`last_synced_at`) + the "verify against the official record" disclaimer remain mandatory. Full
reasoning: docs/decisions/2026-07-03-scraper-sync-contract.md (supersedes 2026-06-24-court-data-strategy.md).
