# Court-kit page migration (WO-45 · BP-17 W-5/W-6)

- **Date:** 2026-07-05
- **Status:** Accepted (Wave 1 shipped)
- **Work order:** WO-45 (promoted from BACKLOG §D "Court-kit adoption + real signals", from BP-17)
- **Author session:** S-WO45-opus

## Context

BP-17 (PR #77) shipped the canonical `src/components/court/` kit — pure, prop-driven, `ec-*`-tokened
components with a **four-state field contract** (`populated | empty | dirty | masked`). It landed with
only three adoption call-sites (the cases list + case detail + timeline, as delegation proof). The rest
of the court surfaces still hand-rolled dates (`ui.fmtDate`), empties (a bare `"—"`), and chips
(`ec-chip` spans). Those hand-rolls are exactly what the kit exists to kill:
- `ui.fmtDate` builds a `Date` with `new Date(d)` then `toLocaleDateString` → locale/timezone-dependent
  (the peshi `format.ts` day-roll bug class); `CourtDate`/`formatCourtDate` parse day-first and format
  from UTC parts, so a date can't silently shift a day or render empty-vs-dirty wrong.
- A bare `"—"` is ambiguous (not-on-record? not-yet-loaded?); `EmptyCell` says *why* it's empty.

## Decision

Migrate the **value fields** on the remaining legaldriver court surfaces onto the kit — the
regression-free, author-consistent scope the cases-page reference already models:

| Surface | Migrated |
|---|---|
| `cause-list/page.tsx` | dates → `CourtDate`/`formatCourtDate`; `court`/`cnr`/`item_no` empties → `CourtField`/`EmptyCell` |
| `judge/[judgeId]/page.tsx` | `case_type`/`disposal` → `CourtField`; `decision_date` → `CourtDate`; tier empty → `EmptyCell` |
| `advocate/[...barId]/page.tsx` | header bar/seniority/alias `ec-chip` spans → `CourtChip`; `case_type`/`side` → `CourtField` (side keeps its PET→success tone); tier empty → `EmptyCell` |
| `cases/[id]/orders-panel.tsx` | `order_date` → `CourtDate` |

Empty labels are **localized** through a new shared key `common.states.notOnRecord`
(en "not on record at eCourts" / hi "eCourts रिकॉर्ड में नहीं", reusing the existing
`caseDetail.empty.onRecord` wording) and threaded via each component's `emptyLabel`/`label` prop — so a
Hindi session no longer sees the kit's English default. Multilingual is a product-wide guardrail.

## Deliberately NOT done (scoped out, with reasons — no silent caps)

- **Categorical `Badge` → `CourtChip` (tier/status/type-mix chips).** The kit's `ChipTone` is *semantic*
  (`neutral|success|warn|danger|hot`) and has no `brand`/`amber` equivalent; the tier Badge is a
  brand-indigo categorical tag. Converting it would either regress the colour or require extending the
  `ChipTone` union + `.ec-chip-*` tokens — a **shared-primitive contract change** that doesn't belong in
  a page-migration PR. The cases-page reference left these as `Badge` too. → **BACKLOG §D W-6b.**
- **peshi-search mirror** (`search`/`case/[cnr]`). Same migration, other repo → **BACKLOG §D**, sequenced
  behind BP-18's distribution decision (FG-10, founder-gated).
- **Real confidence / staleness signals (W-7/W-8).** `ConfidenceBadge`/`StalenessBadge`/`PendencyAge`
  need a real per-record signal from the API — FG-7-adjacent, **founder-gated** (already tracked).
- **`const ct = … || "—"`** in the judge/advocate aggregation loops is a Map **grouping key**, not a
  rendered field — left as-is (an `EmptyCell` can't be a Map key).

## Consequences

- Every migrated court value field now renders through the four-state contract: a missing value shows a
  localized "not on record at eCourts", a malformed one shows `DirtyValue` (with back-pressure), and a
  date can't drift a day. This is an information-integrity (presentation-grade data) win, not just a refactor.
- `tests/wo45_court_kit_adoption.ts` (offline, 22 checks) guards against reintroducing `fmtDate`, a bare
  JSX `"—"`, or a hand-rolled `ec-chip` on these surfaces, plus `formatCourtDate` format+timezone parity.
- No visual regression: `CourtChip` neutral === the old bare `ec-chip`; PET side keeps `ec-chip-success`.
- No new dependency, no migration, no founder gate.
