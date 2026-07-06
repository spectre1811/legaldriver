# WO-59 · Cases tab — status-filter fix + modern filter bar + actionable Attention bar

**Date:** 2026-07-06 · **Session:** S-WO59-opus-20260706 · **Repo:** legaldriver · **Status:** W1–W3 shipped.

WO-59 (founder, via the fleet board) is three complaints about the Cases tab: (1) the "Open" category
shows cases that don't exist / the filter isn't "according to cases"; (2) the dropdowns are legacy;
(3) the overdue/other alerts are passive — "what is to be done for those?". Fixed in three waves; no
migration (all query-only + UI). Founder-approved direction (2026-07-06): semantic tabs + a real
status multi-select, and a new actionable Attention bar.

## W1 — Status filter is semantic + count-consistent (the "Open" bug)

`matter.status` is **free-text eCourts data** ("Pending" / "Disposed" / NULL / …), never a clean
enum, but the old code did an exact `.eq("status", "open")` in **both** the list query and the tab
count. So "Open" showed a count while the filtered list held phantom/zero rows — exactly the founder's
report. Fix (`cases-query.ts`): a shared `planStatusFilter` maps the two semantic groupings to the
**same substring rules the WO-56 portfolio dashboard uses**, and both the list query and the counts
route through it, so a tab count can never disagree with its rows:

- `open` → `status IS NULL, or not disposed/closed`
- `disposed` → `disposed/closed`
- any other value → exact real-status match (`.in`) — the console multi-select.

The tabs are now the **status axis** (All / Open / Disposed); the urgency axis moved to the Attention
bar and **composes** with status via independent URL params (Open + Overdue).

## W2 — Modern filter bar: multi-select upgrade (on WO-62's adoption)

**Coordination:** a parallel WO — **WO-62 W2** — landed the single-select `<Combobox>` adoption on
`cases/console.tsx` (PR #114) *while this branch was in flight*, and its commit explicitly deferred the
multi-select to us ("Multi-select 'is any of' … needs cases-query.ts changes WO-59 owns"). So this
branch was **rebased onto WO-62's console + WO-54's tier tabs and upgraded them** — it does **not**
re-do the single-select adoption (honouring the founder's "don't overdo this if another WO has it").
The facet filters (court / type / stage / status / advocate / act) go from single `<Combobox>` →
**`<MultiSelect>`** (multi · select-all · chips · virtualized); hearing-window + sort stay single
`<Combobox>` (WO-62's).

- **Multi-value = repeated URL params** (`?court=A&court=B`), **not** a comma-joined string — because
  facet values legitimately contain commas (act names like "Indian Penal Code, 1860"). Next.js hands a
  repeated param through as `string[]`. Query maps them to `.in` (scalar cols, OR-within-facet) /
  `.overlaps` (advocate_names / act_names arrays). Saved views snapshot every picked value
  (`string | string[]`).
- **Status "according to cases":** the console Status control is a real multi-select of the **actual
  distinct status values** in the data, on its own `statuses` param — the Open/Disposed semantic
  grouping stays on the tabs; the two compose.

### Deferred / flagged (honest scope)
- **Combobox accent = `--indigo`, not brass.** The shared WO-55 primitive styles its selected-state /
  chips with the `--indigo` system accent, so the Cases page (brass accent) now shows indigo chips.
  Rendered-and-inspected: subtle, reads as "selected", tasteful alongside brass (the Linear pattern) —
  but "one accent per screen" is a house rule. This is a **shared-primitive** property; re-theming it
  is a WO-55 concern, not something to inline-fork here (would create drift). **Flagged to the design
  pass** (BACKLOG §D).
- **Facet source is still the bounded 1000-row scan** (pre-existing). advocate/act use static facets +
  client virtualization (same payload as the old native `<option>` dump, now usable). The proper
  distinct-facet **RPC** (server-side, replacing the scan) remains the already-tracked founder-gated
  follow-up.

## W3 — Actionable Attention bar (alerts redesign)

The overdue/upcoming signals were passive tab-pill counts + red date text — nothing to act on. New
`CasesAttention` bar: **Overdue · Due this week · No hearing date** as semantic-toned cards that state
the count, the next action, and — on click — **filter the list to exactly those cases** (`?next=…`,
toggling off on a second click). Reuses the bounded HEAD counts the page already fetched (no new
query). Only non-empty buckets render; when cases exist but nothing is urgent it shows a calm "all
caught up" line, so the bar is signal, never noise. Four states covered (loading via route
`loading.tsx`; empty→all-clear; populated; the page owns error).

## Verification

- Gates green: `typecheck` + `lint` + `build` + **43/43 offline tests** (incl. new
  `tests/wo59_status_semantics.ts` — pure `planStatusFilter` + a recording-mock proving the query and
  the counts route status through it, never the old `.eq`, and multi → `.in`/`.overlaps`).
- **Rendered-and-inspected** the Attention bar + filter bar against the compiled tokens (static-HTML +
  Playwright shot, the auth-gated-screen method) at desktop + mobile: on-brand, clear hierarchy,
  semantic tones, responsive (stacks to 1 col < 640px).
- **Ship-grade §8 handoff:** the build env has no demo creds → interactive last-mile checks are
  delegated to the QA tester via `e2e/wo59-cases-attention.spec.ts` (stable `data-testid`/`data-active`
  hooks): modern filter bar (no native `<select>`), All/Open/Disposed tabs, attention→filter→toggle.
  Logged in BACKLOG §D4.
