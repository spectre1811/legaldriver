# Advocate onboarding — one structured bar-enrolment input + year-aware eCourts roster fetch (WO-42)

**Date:** 2026-07-05 · **Status:** **accepted** (app-side non-gated; the normalized-columns migration is a founder-gated follow-up) · **Work order:** WO-42 · **Plan ref:** `exec/work-orders/WO-42-advocate-onboarding-barnumber.md` · **Origin:** founder 2026-07-05 — "Yash J Patel, Bar 11240, GJ → **0 cases**" while another advocate got 80.

## Context

Onboarding showed a confusing **three-box** form — "Bar no. (`MAH/1234/1982`)" + a *separate* "eCourts bar code (`1946`)" + a free-text "State" — and a valid advocate got **0 cases**. Two root causes:

1. **False identifier split.** The real id is the **State Bar Council enrolment number** — `STATE / SERIAL / YEAR` (Gujarat `STATE` = `G`, e.g. `G/702/2020`; ⭐ founder ruling 2026-07-05, `exec/LEARNINGS.md`). The **AIBE/BCI** number is a separate national id (irrelevant to eCourts). The old "eCourts bar code" box was *not* a third id — but it is **also not the serial**: a number like `11240` is an **internal eCourts display code** (the `(11240)` inside `MR YASH J PATEL(11240)`), which the roster search must **never** use. Splitting one id into three — and confusing the display code for the serial — is what produced the wrong query.
2. **The enrolment YEAR was never collected.** The eCourts bar-code search (`searchByAdvocateName.php`, `checkedSearchByRadioValue:"2"`) **requires four params** — `barstatecode` (tier-dependent: `GJ` High Court / `GJG` Gujarat district), `barcode` (serial), **`year`**, and numeric `state_code` (17). With no year, the search fell through to a lossy name match → 0 / wrong cases. (Verified against our own WO-34 packet capture: `scraper/mobile_api.py:search_by_advocate`, `docs/HC-ADVOCATE-SEARCH-CAPTURE.md`.)

## Decision

**One structured enrolment field + an explicit State Bar Council dropdown**, and a **year-aware roster fetch that retries both court tiers**.

- **Input UX** (`settings/advocate-form.tsx`): a single "Bar enrolment number" field (placeholder `e.g. G/702/2020`) + a **State Bar Council** `<select>`. The old separate "eCourts bar code" and free-text "State" boxes are gone.
- **Parser** (`lib/court/bar-number.ts`, pure/tested): `^([A-Za-z]{1,4})[\/\-\s.]*(\d{1,6})[\/\-\s.]*((?:19|20)\d{2})$` → `{stateBar, serial, year, canonical}`. It **rejects** an under-specified id (missing year) rather than silently accepting it — that rejection is the fix for the root-cause bug.
- **Storage without a migration.** The enrolment number is *canonically* `STATE/SERIAL/YEAR`, so the year has a natural home: we store the canonical string (with year) in the existing `bar_registration_number`, the serial in `bar_code`, and — **only for a verified council** whose CNR prefix is known-correct — the state token in `state_code` (the cross-state guard). Nothing is invented. **Persisting the parsed parts as their own typed `bar_state_code`/`bar_serial`/`bar_year` columns is deferred to a founder-gated migration** (see Follow-ups) — it is not needed for the functional fix.
- **Two separate "state" representations.** The enrolment **`STATE` prefix** the advocate writes (Gujarat = `G`) is NOT the eCourts token. Each verified council carries both: `statePrefix` (`G`) for parsing/inference and the eCourts `hcBarToken`/`dcBarToken` (`GJ`/`GJG`) + numeric `state_code` (17) for the search. `councilByStatePrefix("G")` resolves the council from the enrolment letter; the dropdown selection is primary.
- **Roster fetch** (`lib/court/advocate-cases.ts`): when the query carries a parsed enrolment (year) + a **verified** council, drive a LIVE `POST /advocate/{serial}/refresh` — passing the **SERIAL** (`702`) as `barcode`, never the eCourts display code — across **HC then the district complex** (`barSearchScopes`). Otherwise fall back to warehouse-by-serial, then fuzzy name. The roster stages (cause-list + fetch + delete) key on the **same** parsed identifier (`bar_registration_number`).
- **Honest empty-state** (`onboarding/actions.ts` + `diagnoseEmptyRoster`): a roster fetch that finds nothing NEVER reports a bare "0 cases". It says why — *no year* (unparsed), *council not live yet* (unverified), or *none found in the courts we searched* (HC + main district complex only — **not** a statewide "none").

## Sourced, not guessed (guardrail)

Only **Gujarat** has packet-verified tokens (`statePrefix="G"`, `GJ`/`GJG`, `state_code=17`), so **only Gujarat is `verified:true`** and drives a live search. Every other State Bar Council in the dropdown captures the enrolment + year and falls back to name search with an honest empty-state; **no unverified council carries a token OR a `statePrefix`** (a test asserts this — an unsourced prefix must never false-match). The per-state map backlog is logged in `exec/DATA-GAPS.md` — the job the WO-43 MITM recon harness exists to do.

## Known-open: live retrieval (founder probe, S-WO41ingest)

Even with the **correct SERIAL + scope + a warmed session**, the mobile bar search still returned **0** for advocates tried. So getting a live NON-EMPTY roster is a **separate open engineering step** (scope/session/tier nuances), NOT a format question — the format above is settled. The honest empty-state is what keeps this from reading as false data until live retrieval is proven. (This corrects an earlier note that treated `11240/2025` as a "known-good tuple" — `11240` is an eCourts display code, not a searchable serial.)

## Follow-ups

- **Founder-gated migration** — add typed `bar_state_code` / `bar_serial int` / `bar_year int` columns (the WO's "store normalized parts") + backfill by re-parsing `bar_registration_number`. Deferred because the canonical string already carries the year functionally; filed to BACKLOG §D.
- **More verified councils** — flip `verified` per state as WO-43 verifies each `barstatecode` pattern; `STATE_BAR_COUNCILS` is the single place to add them.

## Alternatives rejected

- **Keep the 3 boxes, just add a "year" box** — doubles down on the false split; the founder explicitly called the multi-box form confusing.
- **Ship a migration now** — founder-gated (blocks the activation fix on a review it doesn't need); the canonical-string home is correct and reversible.
- **Guess other states' tokens to look complete** — violates information-integrity; a wrong token yields a confidently-wrong roster, which is worse than an honest "not live yet".
