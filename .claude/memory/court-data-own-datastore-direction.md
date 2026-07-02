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

**How to apply:** Keep everything behind the `CourtDataClient` interface (mock + eCourtsIndia
impls now; OwnStore/Vakeel360 later). Day-to-day reads come from our own Postgres; the provider
is hit only on add-case + scheduled refresh. Grow the owned dataset via manual entry + parsed
court-order/cause-list PDFs. NEVER scrape services.ecourts.gov.in / hcservices.ecourts.gov.in
or build a CAPTCHA solver — that's the hard line. Official NIC/eCommittee access is the real
"own it" route (post-MVP). Full reasoning: docs/decisions/2026-06-24-court-data-strategy.md.
