# WO-61 · Advocate onboarding — third-eye review + guided revamp

**Date:** 2026-07-06 · **Status:** in progress (W1) · **Session:** S-WO61-opus-20260706
**Priority:** P0 (founder, via fleet board) · **Branch:** `wt/WO-61` · **Gated?** no (no migration)

## Why (founder)
> "This product is still lacking and not working at all. I call for a third eye review, take a
> step back see what's breaking and get it fixed. The experience should be as good as it gets.
> Also revamp the ui for this, it's not suited and doesn't even work well."

## Third-eye diagnosis — the backend is healthy; the *experience* fails
Recent work fixed the plumbing: **WO-58** set the missing prod `LD_API_KEY` + made fetch outcomes
honest + added warehouse harvest-back; **BP-71** made the roster refresh async (202 + fleet ingest)
and added a live progress bar; **BP-74** built server-side statewide fan-out (positive control: 230
cases). The box proves `GET /advocate/G/4732/1999` → 5,141 cases. So "still doesn't work / not
suited" is an **experience-layer** problem, on five axes:

1. **The form is a trap.** `name` is required; the Bar enrolment number + council — the ONE input
   that makes onboarding actually fetch cases — are **optional with no live validation**. A user can
   submit a name-only or a year-less number, run onboarding, wait up to 60s, and get "0 cases → go
   back and add the year." This is the single biggest "doesn't work."
2. **The page is a developer console.** Two prose "how this works" cards, then a per-advocate
   **9-metric telemetry grid** (causelist / cases_fetched / enriched / deadlines / …). The payoff —
   *"here are your cases"* — is never shown; the user must leave for `/dashboard/cases` to see anything.
3. **Async progress is invisible & lossy.** After the run "finishes", a background harvest polls only
   ~40s; if the fleet hasn't landed cases in that window (common — fleet drain is the known-unreliable
   part), the user sees "Done — 0 cases" and leaves. A *working* async pipeline reads as a blackhole.
   No persistent "still gathering — you can leave" state, no resume-on-return signal.
4. **Errors swallowed** (captured in `fetchAdvocateCasesWithMeta().errors`, never surfaced; no retry),
   **native `confirm()`/`alert()`** for delete (off-brand, no undo, bad mobile), **no loading skeleton**.
5. **Bilingual breaks** — hardcoded EN: "Running…", every stage label (`progress.ts`), the Vercel
   timeout copy. And cryptic bits (raw `state_code` "GJ" shown unlabelled).

## Founder rulings (2026-07-06, via AskUserQuestion)
- **Requirement stance:** *require a parseable enrolment WITH year to run onboarding; keep name-only as
  a clearly-secondary, labelled "cause-list only — no auto case-fetch" path.* (Not a hard block on
  name-only entirely.)
- **Scope:** *full guided revamp, shipped in 3 waves* (each an independently green, self-merged PR).

## Design direction
Turn `/dashboard/onboarding` from an admin list into a guided **"onboard your practice"** flow:
live-validated entry → one coherent honest progress narrative (incl. a persistent background/resume
state) → a **results payoff** (your cases, with a preview) → all four states designed to
`exec/skills/ui-polish-bar.md`, bilingual, with in-app confirm+undo.

## Key decisions
- **No migration → non-gated.** Everything (progress, the persistent "still gathering" state, resume)
  is derived from the existing `onboarding_run` record (`stage`/`status`/`counts`/`updated_at`) that
  the orchestrator already writes. Keeps WO-61 out of the founder-gated lane.
- **Reuse primitives, don't reinvent:** `<Combobox>` (WO-55) for the searchable council select (also
  answers the founder's "legacy dropdowns" complaint), `<ConfirmDelete>` + `undo-toast` (WO-27/43) for
  reversible delete, `EmptyState` + the court kit (`CourtDate`/`CourtChip`) for the case preview.
- **Requirement enforced in two layers:** client disables the primary "Add & fetch" until a parseable
  enrolment exists; `addAdvocate` server action rejects a year-less enrolment unless `mode=name-only`
  was explicitly chosen (defense-in-depth, honest message).
- **Validation logic is pure + offline-tested** (`checkEnrolment` in `bar-number.ts`), reusing the
  settled `parseBarNumber`/`stateBarCouncil`/`councilByStatePrefix` — no re-litigating the canonical
  `STATE/SERIAL/YEAR` format (founder-ruled 2026-07-05).

## Waves (each an independently shippable, self-merged PR)
- **W1 — Guided validated entry (root-cause fix).** Live inline validation as you type (parse →
  "Gujarat • 702 • enrolled 2020 ✓" / "add the enrolment year"), council auto-inferred + searchable
  Combobox, primary "Add & fetch my cases" gated on a parseable enrolment, labelled secondary
  "add by name (cause-list only)". Server-side `mode` guard. `wo61_enrolment_validation` test.
- **W2 — Coherent honest progress + background/resume + retry.** i18n the stage labels + run copy;
  unify the run narrative; persist a "still gathering your roster in the background — you can leave"
  state + a resume banner on return; surface provider errors + a Retry.
- **W3 — Results payoff + polish + confirm/undo + four states.** Replace the 9-metric grid with a
  "your practice" summary + recent-cases preview + collapsible run details; loading skeleton;
  `<ConfirmDelete>` + undo; polish to the UI bar, rendered-and-inspected at 390/768/1440 × en/hi.

## Guardrails honoured
- Info-integrity: never a bare "0" — honest, actionable reasons stay (WO-42/WO-58 contract preserved).
- No fabricated data; provenance + disclaimer untouched. RLS unchanged (reads stay tenant-scoped).
- Bilingual parity (en+hi) for every new/changed string; i18n coverage gate stays green.
