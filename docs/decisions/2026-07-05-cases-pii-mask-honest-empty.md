# Cases: PII-mask + honest-empty hardening (BP-24)

- **Date:** 2026-07-05
- **Status:** accepted
- **Work order:** BP-24 (`plan/exec/work-orders/BP-24-cases-pii-honest-empty.md`)
- **Scope:** legaldriver Cases surface — render-only, no migration/RLS/auth (no founder gate).
- **Builds on:** BP-17 shared court-data component kit (`src/components/court/`).

## Context
eCourts masks protected-matter parties (matrimonial / POCSO / juvenile) as `XXXXXXX`. The scout
Cases audit (`docs/agents/scout-reports/_raw/cases-A1.md`, finding **D5**, severity **S1**) found the
mask guard existed in exactly one place — the regional-alias line. Everywhere else a masked value
rendered verbatim: the case title (detail header + list rows), the primary party name, and judge
cross-links (a masked judge became a live directory search for `XXXXXXX`). A masked name was also a
fuzzy client-match key (`sync.ts` seeds `party_names[]`), so every protected case matched every other.

Separately, absent eCourts fields either silently vanished (the court-details grid filtered empties
out) or rendered a bare, ambiguous `"—"` — the user couldn't tell "not on record" from "not loaded".

## Decision
1. **Detect masks in one place.** Reuse the BP-17 kit's `isMaskedName` (tolerates any run of ≥4 X's
   with spacing/dots). A small `src/lib/court/mask.ts` wraps it with `maskName` / `maskTitle` for the
   plain-string contexts (composed titles) where a component can't slot in — so ingest, sync, render
   and tests share one definition of "masked".
2. **Mask at both layers.**
   - *Ingest* (`legaldriver.ts` `map()`): set `NormalizedParty.masked` and compose a mask-aware
     title, so new/refreshed cases store clean data; `sync.ts` drops masked names from the
     `party_names[]` match seed.
   - *Render* (the two Cases pages): mask again at render — because **already-persisted** rows still
     carry `XXXXXXX`. Render-time masking is what actually satisfies the acceptance for existing data;
     ingest masking is belt-and-braces for the future. Masked judges/parties render `<MaskedName/>`
     and are never wrapped in a search/dossier link.
3. **Honest-empty via the kit's four-state contract.** Every court field routes through `<CourtField>`
   (populated / `EmptyCell` / `DirtyValue` / `MaskedName`). The court-details mirror stops dropping
   empties and shows an explicit "not on record at eCourts" — **but only for court-sourced cases**; a
   manual case has no eCourts record, so it keeps only its filled fields (no misleading 16-field
   "not on record" wall). Info-grid empties get contextual copy ("no client linked", "none scheduled",
   "not on record at eCourts", "not set") instead of a bare `"—"`.

## Deviation from the scout spec (intentional, more correct)
The scout suggested "not on record at eCourts" for *both* grids. The info grid mixes court fields with
app fields (client, next hearing), where that copy would be wrong — so info-grid empties use
per-field contextual copy. This is stricter information-integrity, not a scope cut.

## Consequences
- First real adoption of the BP-17 kit — proves the four-state contract in a live page.
- No raw `XXXXXXX` renders anywhere on Cases; protected names are excluded from matching.
- All copy is bilingual (en/hi, full key parity). No schema/data change; existing rows render correctly.
- Test `tests/bp24_cases_pii_honest.ts` (offline group) gates the mask + seed-exclusion contracts.
