# Court-data strategy: licensed API now, our own datastore over time

**Date:** 2026-06-24 · **Status:** accepted, with a forward track

## Context

Yash asked twice whether we can avoid depending on eCourtsIndia (a paid provider) and
"build our own database like them." This note records the reasoning and the plan.

## The hard line (what we will NOT do)

The official portals — `services.ecourts.gov.in`, `hcservices.ecourts.gov.in` — put **every
query behind a CAPTCHA** and **prohibit automated access** in their terms of use. "Building
our own database like eCourtsIndia" the way the data resellers do it means running a
**CAPTCHA-solving scraper at scale**. That is:

- against the brief's hard constraint,
- legally risky (TOU violation) for a product holding sensitive legal + email data,
- a permanent cat-and-mouse maintenance burden (portals change, CAPTCHAs harden).

So: no scraping, no CAPTCHA solving. This is non-negotiable.

## What "build our own data" CAN legitimately mean

We can absolutely reduce/eliminate dependence on a reseller over time, through legitimate
sourcing — and the architecture is built so we can:

1. **Own datastore as a cache + system of record.** Everything we legitimately retrieve
   (via the licensed API, manual entry, uploaded court-order PDFs we parse) is persisted in
   our own Postgres (`matter`, `hearing`, `cause_list_entry`, `document`, ...). Over time this
   becomes a real, owned dataset for our tenants' tracked matters — we re-read our own store,
   not the provider, for day-to-day reads. The provider is only hit on refresh/new-case.
2. **Manual + document-derived entry.** Advocates can add/correct cases by hand, and we parse
   uploaded orders/cause-list PDFs (the same Claude pipeline as Gmail docs) into structured
   rows. This fills gaps the API can't and is 100% ours.
3. **Official access path (the real "own it" move).** NIC/eCommittee can grant approved
   entities structured access (not the public CAPTCHA portal). That's an application/approval
   process, out of MVP scope, but it's the legitimate route to first-party data at scale.
   Flagged as a future track.
4. **Provider-swappable interface.** All court access goes through one `CourtDataClient`
   interface. Impls: `MockCourtDataClient` (free, dev/test), `ECourtsIndiaClient` (live demo),
   and later `OwnStoreCourtDataClient` / `Vakeel360Client`. Swapping is a one-file change.

## Decision

- **MVP:** build behind `CourtDataClient`. Default to the **mock provider** for dev (₹0), flip
  to **eCourtsIndia** (token provided; free signup credits) for live data and the demo.
- **Reads** come from our own Postgres; the provider is hit only on add-case + scheduled
  refresh. This already makes us mostly self-reliant for day-to-day use.
- **Forward track (post-MVP):** grow the owned datastore via manual + document-derived entry,
  and pursue official NIC/eCommittee access to drop the reseller for sourcing entirely.

## Implications for the schema

Already compatible: `matter.source` + `matter.last_synced_at` record provenance per row, so
a matter sourced from manual entry vs. eCourtsIndia vs. a future own-pipeline is distinguishable
and displayable ("source: …, last refreshed …").
