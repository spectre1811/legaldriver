# Shared court-data component kit (`src/components/court/`) — BP-17

**Date:** 2026-07-05 · **Status:** **accepted** (non-gated; design/presentation, no data path, no schema) · **Work order:** BP-17 · **Plan ref:** scout `_raw/cross-design-system-warden.md` §4/§6, `CRITICAL-PATH.md` #11, `BUILDOUT-PLAN.md` P3

## Context

Court-data rendering was hand-rolled per surface. The design-system-warden audit found three
duplicate chip tone→class maps (`chip()` on the cases page, `TYPE_CHIP` in the timeline,
`ui.tsx Badge`/`TONES`), provenance rendered as inline strings, bare `"—"` for empty cells, silent
junk rendering of un-decoded values, and **zero** confidence / pendency / masked-name / staleness /
interpretation components despite the charter's four-state requirement (AC7). peshi-search had
drifted further (own tokens — fixed by BP-16 — own timeline, own `format.ts` with a
`new Date("13-05-2024")` day-first parse bug, its own `provenance.tsx`). Every P4–P6 render work
order depends on this kit, so it is the widest-dependency unblocker.

## Decision

Create a **canonical, pure/prop-driven component kit** at `src/components/court/` (14 components +
a pure logic core), `ec-*`-tokened, that peshi-search can consume verbatim.

1. **Pure logic core (`logic.ts`)** — every band/parse/detect decision (confidence bands per the
   FG-3 thresholds, pendency banding with disposal-freeze, robust day-first date parse, masked
   detection, staleness vs a caller-supplied SLO, HTML-entity decode, and the four-state resolver).
   No React, no imports — unit-tested in isolation (`tests/bp17_court_kit.ts`, 152 checks).
2. **Four-state contract enforced by construction** — `<CourtField>` routes a value through
   `resolveFieldState()` to **exactly one** of `{populated → CourtChip, EmptyCell, DirtyValue,
   MaskedName}`. "Specify all four states" becomes impossible to forget because it is one switch.
3. **Copy is prop-driven (English defaults), not next-intl-coupled** — the kit takes label strings
   as props so both apps render identical structure while each supplies its own translations, and
   the kit stays free of shared-message-key coupling. Verified by a test that the portable files
   import no Supabase / `next-intl/server` / app-icon / `server-only` module (kit-local inline
   icons instead).
4. **Fold-ins keep one canonical home** — `CodeLabel` (WO-32, re-tokened `text-ink-faint` →
   `text-ec-n400`, decoupled to a structural type) and the `HearingTimeline` (promoted from
   `case-timeline.tsx`) now live in the kit; the old paths re-export / delegate so no page breaks.
   `Disclaimer` moved into the kit (prop-driven copy); `ui.tsx` wraps it with its next-intl string.
   `CourtProviderBanner` renders through the kit's shared `NoticeBanner` but **stays app-side** (it
   reads the legaldriver provider config + `next-intl/server`) so the pure barrel isn't poisoned.

## Scope boundary (what BP-17 is NOT)

- **Page migration (W-5/W-6)** — sweeping every cases/causelist/judge/docs page and peshi off their
  hand-rolled chips onto the kit is follow-on work (partly data-gated) → BACKLOG §D.
- **Real signals (W-7/W-8)** — `ConfidenceBadge`/`MaskedName`/`PendencyAge` render from props; the
  API must emit a match-confidence score + protected flag, and a reliable filing date, for them to
  fire on real data (ADR-0004 contract extension) → BACKLOG §D.
- **Distribution (BP-18 / FG-10)** — peshi consumes by mirroring the folder for now; shared npm
  package vs sync-copy vs submodule is founder-gated.

## Consequences

One tone→class map, one date parser, one decoder, one provenance line, one timeline — drift is
structurally prevented. New render WOs compose the kit instead of re-deriving chrome. The four
charter states are four components, so information-integrity is enforced by the type of thing you
reach for, not by a reviewer remembering to check.
