# Shared modern combobox primitive (WO-55 · Wave 1)

- **Date:** 2026-07-06
- **Status:** Accepted (Wave 1 shipped)
- **Work order:** WO-55 (Modern combobox primitive + app-wide adoption) — Wave 1 "build the primitive"
- **Author session:** S-WO55-opus-20260706

## Context

The founder flagged (2026-07-06, with a Cases-filter screenshot) that **every dropdown in the app is
a legacy native `<select>`** — no in-list search, no scroll optimization, no multi-select. The grounded
audit found **40 native `<select>` elements, ~14 of them over long DB-derived lists** (advocates, acts,
courts, clients, matters, practice areas — hundreds–thousands of options). Picking an advocate from a
giant native `<select>` is painful and there's no way to say "advocate A **or** B" — the filter feels
broken. This is a cross-app quality problem best fixed **once** with a shared primitive, not per surface.

## Decision

Adopt **Headless UI** (`@headlessui/react` `Combobox`) as the base and ship two shared, presentational
components under `src/components/combobox/`, consumed by every future dropdown swap.

### Why Headless UI (over the alternatives)
- **Tailwind-native + fully headless** — styles via `data-*` attributes / render props, so it drops into
  the hand-rolled "Editorial Chambers" tokens with **zero CSS fight** (unlike `react-select`'s emotion styling).
- **All four asks in one dep:** searchable (`Combobox`), **multi-select** (`multiple`, built-in),
  **virtualized** (`virtual`, TanStack Virtual bundled — no separate dep), and **WAI-ARIA-APG a11y**
  (`role=combobox`, `aria-expanded/controls/autocomplete`, **`aria-activedescendant`** highlight with focus
  kept on the input, full keyboard) handled for us — a11y is the acceptance bar, and we don't hand-roll it.
- **Rejected:** Radix Select (not searchable *by design*); shadcn/cmdk (multi-select + virtualization are
  DIY — open issues); react-select (~30kb, emotion-styled, fights Tailwind). **React Aria** stays the
  fallback if we ever need stricter a11y than Headless UI.

### The two components

| Piece | What it owns |
|---|---|
| `<Combobox>` | single-select, searchable. Static `options` **or** async `loadOptions(query)` (the ship-grade fork), `virtualized?`, `clearable?`, `renderOption?`, required `label` (→ `aria-label`). Search icon + chevron + clear affordance; honest loading/error/empty rows. |
| `<MultiSelect>` | `multiple`: **checkbox-in-list** (discoverable — NN/g) + removable **chips** above the control (each × keyboard-removable; Backspace-in-empty-input removes the last), **"+N" count** on overflow, **Clear all**, optional **Select all / Deselect all** (bounded lists), popup **stays open** on toggle. |
| `logic.ts` (pure) | `filterOptions` (token-AND over label+hint), `resolveStrategy` (the threshold rule), `toggleValue`/`selectAllValues`/`allSelected`/`chipOverflow`/`labelForValue`, `debounce`. DOM-free → unit-tested offline (`tests/wo55_combobox.ts`). |
| `use-async-options.ts` | resolves the shown list from static (client-filter) **or** async (debounced 250ms, **race-guarded** — a superseded response is dropped) with honest `loading`/`error`. |

### Ship-grade fork (never ship thousands of options to the client)
`resolveStrategy` encodes the rule: **remote/unknown → async debounced server-search** (`loadOptions`;
advocate/party/matter/client pickers query the top-N) · **>150 static → virtualize** · **≤150 → render all**.

## Consequences

- **New dependency: `@headlessui/react` ^2.2` (+ its bundled `@tanstack/react-virtual`).** Shared-config
  change → **flagged** per protocol (not founder-gated). First-load JS unaffected on unadopted routes
  (client-component, imported only where rendered); build green.
- Adoption is deferred to Waves 2–5 (Cases filter bar first — the founder's screenshot; then the ~14
  client/matter/advocate pickers via async search; then the static selects; then a guardrail against new
  raw `<select>` over DB-derived lists). **A primitive with zero adopters is shelfware** — the census +
  sweep are tracked in the WO and must land before WO-55 is "done" (LEARNINGS: "shipping a primitive ≠ adopting it").
- Coordinates with **WO-54** (its tier-aware facets render as these comboboxes) — primitive built first.

## Gates

`typecheck` clean · `lint` clean · `tests/wo55_combobox.ts` **36 assertions PASS** (offline group) ·
`build` green · i18n `combobox` namespace en+hi at parity.
