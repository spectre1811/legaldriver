# Advocate onboarding — one structured bar-enrolment input + year-aware eCourts roster fetch (WO-42)

**Date:** 2026-07-05 · **Status:** **accepted** (app-side non-gated; the normalized-columns migration is a founder-gated follow-up) · **Work order:** WO-42 · **Plan ref:** `exec/work-orders/WO-42-advocate-onboarding-barnumber.md` · **Origin:** founder 2026-07-05 — "Yash J Patel, Bar 11240, GJ → **0 cases**" while another advocate got 80.

## Context

Onboarding showed a confusing **three-box** form — "Bar no. (`MAH/1234/1982`)" + a *separate* "eCourts bar code (`1946`)" + a free-text "State" — and a valid advocate got **0 cases**. Two root causes:

1. **False identifier split.** There are only TWO relevant ids: the **State Bar Council enrolment number** (`STATE / SERIAL / YEAR`) and the **AIBE/BCI** number (national, irrelevant to eCourts). The "eCourts bar code" box was not a third id — it was just the *serial sub-field* of the enrolment number. Splitting one id into three created the confusion.
2. **The enrolment YEAR was never collected.** The eCourts bar-code search (`searchByAdvocateName.php`, `checkedSearchByRadioValue:"2"`) **requires four params** — `barstatecode` (tier-dependent: `GJ` High Court / `GJG` Gujarat district), `barcode` (serial), **`year`**, and numeric `state_code` (17). With no year, the search fell through to a lossy name match → 0 / wrong cases. (Verified against our own WO-34 packet capture: `scraper/mobile_api.py:search_by_advocate`, `docs/HC-ADVOCATE-SEARCH-CAPTURE.md`.)

## Decision

**One structured enrolment field + an explicit State Bar Council dropdown**, and a **year-aware roster fetch that retries both court tiers**.

- **Input UX** (`settings/advocate-form.tsx`): a single "Bar enrolment number" field (placeholder `e.g. GUJ/11240/2025`) + a **State Bar Council** `<select>`. The old separate "eCourts bar code" and free-text "State" boxes are gone.
- **Parser** (`lib/court/bar-number.ts`, pure/tested): `^([A-Za-z]{1,4})[\/\-\s.]*(\d{1,6})[\/\-\s.]*((?:19|20)\d{2})$` → `{stateBar, serial, year, canonical}`. It **rejects** an under-specified id (missing year) rather than silently accepting it — that rejection is the fix for the root-cause bug.
- **Storage without a migration.** The enrolment number is *canonically* `STATE/SERIAL/YEAR`, so the year has a natural home: we store the canonical string (with year) in the existing `bar_registration_number`, the serial in `bar_code`, and — **only for a verified council** whose CNR prefix is known-correct — the state token in `state_code` (the cross-state guard). Nothing is invented. **Persisting the parsed parts as their own typed `bar_state_code`/`bar_serial`/`bar_year` columns is deferred to a founder-gated migration** (see Follow-ups) — it is not needed for the functional fix.
- **Roster fetch** (`lib/court/advocate-cases.ts`): when the query carries a parsed enrolment (year) + a **verified** council, drive a LIVE `POST /advocate/{serial}/refresh` across **HC then the district complex** (`barSearchScopes`), so a single-tier advocate is never missed. Otherwise fall back to warehouse-by-serial, then fuzzy name. The two roster stages (cause-list + fetch) now key on the **same** parsed identifier (`bar_registration_number`), not two different columns.
- **Honest empty-state** (`onboarding/actions.ts` + `diagnoseEmptyRoster`): a roster fetch that finds nothing NEVER reports a bare "0 cases". It says why — *no year* (unparsed), *council not live yet* (unverified), or *genuinely none* (verified search ran) — per the information-integrity skill.

## Sourced, not guessed (guardrail)

Only **Gujarat** has packet-verified tokens (`GJ`/`GJG`/`state_code=17`), so **only Gujarat is `verified:true`** and drives a live search. Every other State Bar Council in the dropdown captures the enrolment + year and falls back to name search with an honest empty-state; **no council carries an unverified token** (a test asserts this). The per-state token-verification backlog is logged in `exec/DATA-GAPS.md` and is exactly the job the WO-43 MITM recon harness exists to do.

## Follow-ups

- **Founder-gated migration** — add typed `bar_state_code` / `bar_serial int` / `bar_year int` columns (the WO's "store normalized parts") + backfill by re-parsing `bar_registration_number`. Deferred because the canonical string already carries the year functionally; filed to BACKLOG §D.
- **More verified councils** — flip `verified` per state as WO-43 verifies each `barstatecode` pattern; `STATE_BAR_COUNCILS` is the single place to add them.

## Alternatives rejected

- **Keep the 3 boxes, just add a "year" box** — doubles down on the false split; the founder explicitly called the multi-box form confusing.
- **Ship a migration now** — founder-gated (blocks the activation fix on a review it doesn't need); the canonical-string home is correct and reversible.
- **Guess other states' tokens to look complete** — violates information-integrity; a wrong token yields a confidently-wrong roster, which is worse than an honest "not live yet".
