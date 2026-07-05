# Shared selection / bulk-action primitive (WO-43 · Wave 1)

- **Date:** 2026-07-05
- **Status:** Accepted (Wave 1 shipped)
- **Work order:** WO-43 (Case workspace → senior-grade) — Wave 1 "shared list foundation"
- **Author session:** S-WO43-opus-20260705

## Context

WO-27 built a genuinely good multi-select experience for Documents: always-visible checkboxes,
shift-click range selection, a floating bulk-action bar, reversible soft-delete with a 10s Undo
toast, and a Trash mode. But it was **inlined inside `documents/documents-browser.tsx`** — only
Documents had it. The only shareable piece was the pure `src/lib/select-range.ts` (`rangeIds` +
`toggle`). Every other hero list (Cases, Clients, Notices, Invoices, IP) had no selection at all,
and the founder's headline complaint is exactly that Cases "lacks checkboxes/bulk-delete."

WO-43 exists to fix that class of problem *once* rather than re-implement selection per surface.
Wave 1 (this change) is the enabling refactor: extract the primitive, prove it by moving Documents
onto it with **zero UX change**, and unblock every subsequent list.

## Decision

Extract the WO-27 selection UX into a shared, presentational primitive under
`src/components/selection/` and make Documents consume it:

| Piece | What it owns |
|---|---|
| `useSelection(orderedIds, { escClears })` | the selection `Set` + shift-click anchor; `onRowClick`, `toggleGroup`, `allSelected`, `isSelected`, `clear`. `escClears` (default true) wires a window-Escape→clear listener; a list that already owns Escape (Documents closes its preview first) passes `false` and calls `clear()` itself. |
| `<BulkBar count label clearLabel onClear>` | the floating pill chrome; renders only when `count > 0`; the caller passes its own action buttons as children (styled with the exported `bulkBtn`). |
| `<RowCheckbox>` / `<SelectAllCheckbox>` | the row checkbox (reports shift-key via `onClick`) and the header select-all-in-group checkbox. |
| `useUndo(timeoutMs)` + `<UndoToast>` | the 10s auto-dismiss undo state + its toast; `show(ids, msg)` / `dismiss()`. |

The pure set-algebra stays in `src/lib/select-range.ts` (now also `allSelected`, `toggleGroup`,
`addRange`) so it's unit-tested without a React renderer.

**The primitive holds no strings.** Copy (labels) is passed in already i18n-resolved, so a consumer
supplies its own namespace's keys — no new global message keys, no i18n-parity churn in this wave.

## Why this shape

- **Presentational, copy-injected** → the chrome is shared but each list keeps its own actions
  (Documents keeps export / file-to-client / file-to-case / delete / restore / purge as `<BulkBar>`
  children). A monolithic "bulk bar that knows every action" would couple all lists together.
- **`escClears` opt-out** preserves Documents' exact behaviour (Esc closes the quick-look preview
  first, and only clears the selection when no preview is open) — behaviour parity was the bar for
  Wave 1, since a refactor that changes UX isn't a refactor.
- Pagination is **not** re-built here: WO-39 already shipped `src/lib/paginate.ts` +
  `<PaginatedList>`/`<Pagination>`. Wave 2's Cases list consumes those (the WO's "if it lands there,
  consume it — don't duplicate" note).

## Scope / non-goals (deferred to later waves — some founder-gated)

- **Reversible bulk-delete of *matters*** (Wave 2) needs a soft-delete marker on `matter`
  (`deleted_at`) — a **founder-gated migration**. Documents' reversible delete rides on an existing
  `extracted.deletedAt` JSON field (no migration); matters have no equivalent, so the reversible
  bulk path for Cases is presented, not applied, in this wave.
- **Tasks / Notes** tables (Wave 3) — founder-gated migrations.
- Rolling the primitive onto Clients/Notices/Invoices/IP + ⌘K/craft — Wave 4.

## Verification

- `tests/wo43_selection.ts` (offline group, gates every PR): the new pure helpers (`allSelected`,
  `toggleGroup`, `addRange`) directly, **and** a source-assertion contract — the barrel exports the
  primitive and Documents imports it / no longer declares its own `useState<Set<string>>` — so a
  future edit can't silently re-inline selection into one surface again.
- Gates: `typecheck` + `lint` + **31/31 offline** + `build` all green. No migration, no dependency,
  no CI-YAML change, no founder gate. Not browser-click-tested (no demo creds this env) → owed to
  the `ui-qa-tester` (§D4 verify-next); the refactor is behaviour-preserving and source-locked.
