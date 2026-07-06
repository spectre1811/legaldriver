# Modern combobox adoption sweep (WO-62 · continues WO-55)

- **Date:** 2026-07-06
- **Status:** Accepted (PR #114: W2 + W3a · PR #2 [this]: W3b + missed pickers + W5 guardrail. Only the 2 dark bulk-bar action-triggers remain — need a compact `onDark` combobox variant)
- **Work order:** WO-62 (adoption sweep) — implements the adoption WO-55 built the primitive for
- **Author session:** S-WO62-opus-20260706

## Context

WO-55 shipped the shared `<Combobox>`/`<MultiSelect>` primitive (`src/components/combobox/`, decision
doc `2026-07-06-combobox-primitive.md`) but swapped **zero** surfaces — a primitive with no adopters is
shelfware. WO-62 does the adoption: replace the app's remaining native `<select>`s (16 files) with the
searchable, scroll-optimized, WAI-ARIA-APG combobox — the founder's actual "modern dropdowns everywhere"
ask, and the dropdown leg that WO-59 (Cases tab) explicitly deferred to "some other WO".

Why a new WO id rather than re-opening WO-55: the claim ledger (`claim.py`) treats WO-55's row as
`DONE` (its status cell records "W1 DONE"), so it refuses re-claim and directs new work to a fresh id.
WO-62 is that id; it references WO-55 for the primitive contract.

## Decision

Adopt the primitive surface-by-surface, highest-pain first, each wave independently green and shippable.

### Adoption pattern (per site)
- **URL-param filters** (Cases console, Documents filter bar): `value = searchParams.get(key) ?? null`,
  `onChange = (v) => setParam(key, v ?? "")`. Cleared (`null`) = the "all/any" state — the placeholder
  renders the old empty `<option>` label. No query-layer change.
- **Controlled-state pickers** (review-inbox, voice tag, doc-actions refile): `value = state || null`,
  `onChange = (v) => setState(v ?? "")` — a drop-in for `value`/`onChange` on the native select.
- **Bounded options from props** are passed to the static `options` path and `virtualized` past
  `RENDER_ALL_MAX` (150). The Cases/Documents facet arrays already arrive as **deduplicated distinct
  string[]** from a bounded (≤1000-row) server scan, so the static path is ship-grade — no fetch-all to
  the client. (The wider facet-scan efficiency is WO-54/WO-57's scope, not changed here.)

### Shipped this WO
- **W2 — Cases filter bar** (`cases/console.tsx`): all 8 filters (court, case_type, stage, status,
  advocate, act, next-hearing, sort) → `<Combobox>`. The founder's screenshot pain (unsearchable
  advocate/act/court native selects) is resolved. **No `cases-query.ts` touch** — WO-59 owns that file
  concurrently; staying in `console.tsx` avoids the collision.
- **W3a — client/matter pickers (controlled/URL sites)**: `documents/filter-bar.tsx` (5 filters),
  `documents/review/review-inbox.tsx` (per-doc client+case), `voice/row-actions.tsx` (tag client+case),
  `doc-actions.tsx` (refile client+case).

### Deferred (tracked follow-ups — WO-62 stays IN-PROGRESS)
- **W3b — form-field pickers** (`calendar/add-entry.tsx`, `notices/notice-form.tsx`,
  `voice/uploader.tsx`): these are native `<select name=...>` read from `FormData` on server-action
  submit. `<Combobox>` is controlled and emits no form field, so each needs a **hidden `<input>` mirror**
  (`<input type="hidden" name={name} value={value ?? ""}>`). Correctness-sensitive (breaks submission if
  wrong) and not locally click-testable without demo creds → done deliberately, separately.
- **Documents-browser bulk bar**: the "file to client/case" selects sit on a **dark bulk bar**
  (`bg-paper/15 text-paper`, rounded-full); the standard light combobox skin doesn't fit → needs a
  combobox skin variant (design work), not a mechanical swap.
- **W4 — static fixed enums**: `research/filters.tsx`, `clients/client-intake.tsx`, `ip/ip-form.tsx`,
  `draft/draft-ui.tsx`, `cases/[id]/time-expense.tsx`, `calendar` kind. Low-pain (tiny fixed lists) —
  convert for visual consistency.
- **W5 — guardrail**: a grep/lint check that fails on a *new* raw `<select>` over a DB-derived list.
  Deliberately **after** full adoption — it would false-fail on the not-yet-swapped natives above.
- **Multi-select "is any of"** for Cases status/stage: needs `cases-query.ts` (`IN (...)`) changes that
  WO-59 owns right now → coordinate after WO-59 lands, then swap those two to `<MultiSelect>`.

## Update — second wave (this PR): finished the sweep bar the dark bulk-bars
After the founder asked to actually finish "everywhere", a corrected inventory found the real
surface is ~18 files (the first pass's grep missed `cases/cases-table.tsx`, `inbox/review-inbox.tsx`,
`search/judgments/filters.tsx`, `pagination.tsx`). This wave swapped:
- **Missed controlled/URL pickers:** `inbox/review-inbox.tsx` (client+case), `search/judgments/filters.tsx`
  (court+year+disposal facets), `cases/[id]/deadline-rules.tsx` (rule).
- **W3b form-field pickers** (hidden-input mirror pattern): `calendar/add-entry.tsx` (matter),
  `notices/notice-form.tsx` (matter), `voice/uploader.tsx` (client) — each renders
  `<input type="hidden" name=… value={val ?? ""}>` beside the controlled `<Combobox>` so the value
  still reaches the server action's `FormData`; `voice/uploader` also resets the state on a successful
  submit (native `form.reset()` doesn't touch React state).
- **W5 guardrail:** `tests/wo62_combobox_adoption.ts` (offline, registered in `run-tests.mjs`) — fails
  on any un-allowlisted native `<select>`, asserts the flagship surfaces import the Combobox, and
  asserts each form picker kept its hidden input. The allowlist encodes the "fixed-enum-native-OK" line.

### Deliberately KEPT native (guardrail-allowlisted — tiny fixed enum, search adds nothing)
`components/pagination.tsx` (page-size 25/50/100), `clients/client-intake.tsx` (type),
`ip/ip-form.tsx` (type), `cases/[id]/time-expense.tsx` (category), `calendar/add-entry.tsx` (kind),
`assistant/draft/draft-ui.tsx` (language). A search box over ≤6 fixed options is worse UX; converting
would only add hidden-input plumbing for no user benefit.

### Still open (needs a primitive variant, tracked in BACKLOG §D)
`documents/documents-browser.tsx` (file-to-client / file-to-case) and `cases/cases-table.tsx` (bulk
set-stage) are **compact action-triggers on a dark bulk bar** (`bg-paper/15 text-paper`, `py-1`,
rounded-full). The current combobox skin is a 2.75rem light input — dropping it there breaks the bar's
size/tone rhythm, and these are momentary pickers, not persistent filters. They need a compact
`onDark` Combobox variant (a real design task) before swap — deferred rather than shipped ill-fitting.

## Consequences
- Every swept dropdown is now searchable, keyboard-navigable (APG), scroll-bounded, and clearable — a
  uniform modern control replacing the legacy native selects.
- No new dependency (the primitive + `@headlessui/react` landed with WO-55).
- No data-path / query change; no migration; not founder-gated (UI only).
- The remaining waves are enumerated above so the next session (or a continuation) can finish the sweep
  without re-discovering the surface list.
