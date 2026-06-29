# Advocate Onboarding Workflow — Decomposition (Decision Doc)

- **Date:** 2026-06-29
- **Status:** Proposed (design only — no code in this doc)
- **Owner:** LexDriver / legaldriver
- **Related:** `2026-06-24-court-data-strategy.md`, `2026-06-25-court-data-sourcing.md`,
  `2026-06-28-court-corpus-*.md`, `2026-06-29-rich-court-data-sources.md`, `TASKBOARD.md`

## 1. What the operator wants (the flow)

> Advocate enters their **bar registration number** → all their **open cases** appear with
> everything attached (parties, hearings on the calendar, deadlines), kept refreshed → their
> **past/closed cases with judgments** are available to manage → then their **Gmail inbox** is
> auto-searched and any documents (in mail **or** already in the system) auto-attach to the right
> open case via a suitable identifier (CNR / case-number / party names) → culminating in an **AI
> workflow**: case summary, next actions, what to present, arguments, and auto-drafting where the
> collected data makes it possible.

Design rule throughout (CLAUDE.md §5): **deterministic code resolves, files, schedules, and
verifies; the LLM only infers/judges where the input is genuinely dynamic.** Every LLM step lands
in a review/confirm gate — no auto-send, no auto-delete.

## 2. Honest data-availability map (the compliance reality)

This is the load-bearing constraint. **There is NO compliant automated source that returns an
advocate's live OPEN cases by bar number today.** The only services that claim it (eCourtsIndia &
peers) do so by re-scraping `services.ecourts.gov.in` behind a CAPTCHA solver — which CLAUDE.md §2
and `2026-06-24-court-data-strategy.md` forbid us to build, call, or consume. So we are honest with
the advocate: we approximate "open cases" from the compliant sources we *do* have, and use HITL +
manual-add to fill the live-status gap.

| Want | Bar number can pull TODAY (compliant) | Source / table | Blocked / gap | Compliant approximation |
|---|---|---|---|---|
| **Open cases list** | Cause-list entries for next N days (where a licensed cause-list feed exists) + cases the advocate adds by CNR | `cause_list_entry` (via `CourtDataClient.getCauseList`), `matter` | Full live open-case roster by bar number (CAPTCHA-gated) | Seed `matter` rows from (a) cause-list CNRs, (b) manual CNR add → `getCaseByCNR` through the gateway, (c) HITL paste. Label provenance honestly. |
| **Live case status / next date** | Per-CNR detail when a *licensed* provider is configured; else cache | `court_cache`, `getCaseCached`, `matter.last_synced_at` | Live re-scrape (forbidden) | HITL refresh (`court_refresh_request`) — advocate solves CAPTCHA on the official portal, pastes payload back; we parse + `upsertCase`. Always show "source + last refreshed". |
| **Closed cases + judgments by advocate** | Yes — full open corpus | `corpus-athena.ts`: `case_details.{pet_advocate,res_advocate}` (advocate→CNRs), `judgments_all` (CNR→judgment, PDF) | Coverage incomplete (25 HCs / 45 benches + SC; "growing") | Search by advocate name (not bar #) over `case_details`; join `judgments_all` on CNR for the order PDF. Honest "coverage is partial". |
| **Inbox documents** | Yes (Gmail readonly) | `mail/ingest.ts`, `email_message`, `document` | — | Already built; extend the matcher (§5). |
| **AI briefing/drafts** | Yes | `services/agent/*`, `docs/case-summary.ts`, `ai/complete.ts` | — | Already built; orchestrate per-case + add draft step (§6). |

**Headline honesty statement we show in the onboarding UI:** *"Indian courts don't offer a
compliant feed of an advocate's open cases by bar number, so we don't scrape one. We assemble your
matters from your cause list, the cases you add by CNR, and your inbox, and keep them refreshed via
the official portal. Closed cases and judgments are pulled from the open judgments corpus by your
name. Everything is marked with its source and last-refreshed time, and is not legal advice."*

## 3. The pipeline — discrete, resumable stages

Each stage is **idempotent** and **resumable**: it keys off durable rows so a re-run skips finished
work. An `onboarding_run` row (new — §7) holds the cursor/stage so the UI can show progress and the
job can resume after a crash or a Vercel timeout. `[D]` = deterministic, `[LLM]` = LLM.

```
Stage 0  Capture advocate            [D]   form → advocate{bar,name,state}        table: advocate
Stage 1  Cause-list seed             [D]   getCauseList(bar) next N days          → cause_list_entry, matter (seed)
Stage 2  Per-CNR enrich + calendar   [D]   getCaseCached(cnr) → upsertCase        → matter/hearing/court_order + reminders
Stage 3  Deadlines from rules        [D]   deadline_rule × hearings/orders         → deadline + reminders
Stage 4  Closed cases + judgments    [D]   corpus by advocate name (Athena)        → matter(closed) / read-model
Stage 5  Inbox sweep                 [D+LLM] ingestMail backfill + classify        → email_message, document
Stage 6  Auto-attach (mail+existing) [D]   resolveFiling + identifier match        → document.matter_id, audit_event
Stage 7  AI briefing per open case   [LLM] case-summary core                       → matter.ai_summary
Stage 8  AI workbench (on demand)    [LLM] agent: next actions / present / args    → agent_thread/agent_turn
Stage 9  Auto-draft (gated)          [LLM] completeText → DRAFT only               → document(draft) / notice, never send
```

### Stage 0 — Capture advocate `[D]`
Reuse `settings/actions.ts:addAdvocate` (`advocate` table: `name`, `bar_registration_number`,
`state_code`, `courts`). Onboarding wraps this and creates the `onboarding_run` cursor. Bar number
is the user-facing key; internally most compliant sources key on **name + state**, so we store both.

### Stage 1 — Cause-list seed `[D]`
Source: `CourtDataClient.getCauseList({date, barNumber, name, stateCode})` for the next N days
(reuse the LOOKAHEAD loop in `api/cron/causelist/route.ts`). For each item: upsert
`cause_list_entry` (unique on `tenant_id,advocate_id,list_date,item_no`), and for each distinct
CNR seed a lightweight `matter` (status `active`, `source='causelist'`) if one doesn't exist. This
is the **only compliant "your open cases" signal keyed off the advocate** — and only where a
licensed cause-list feed is configured (mock provider in dev; HITL-pasted cause list otherwise via
`causelist-parse.ts`). Resumable: cursor = last `list_date` processed.

### Stage 2 — Per-CNR enrich + attach to calendar `[D]`
For every seeded/added CNR, call `getCaseCached(cnr, {force?})` (gateway: shared `court_cache`,
stale-fallback, provider-health) → `upsertCase(supabase, tenantId, normalizedCase)`. `upsertCase`
already: writes `matter` (+ denormalized `party_names/advocate_names/judge_names/act_names`),
**replaces `hearing` rows**, replaces `court_order` rows, and **`scheduleReminders` for the next
hearing** (the calendar/reminder mechanics — §4). No new code for the calendar wiring; it's a fan-
out over existing `upsertCase`. Where no licensed per-CNR provider exists, the case stays at cause-
list depth and is flagged "verify live status (HITL)". Resumable: cursor = list of CNRs with
`last_synced_at` older than TTL.

### Stage 3 — Deadlines from jurisdiction rules `[D]`
`deadline_rule` (table exists) × the freshly-synced hearings/orders → compute `deadline` rows
(`kind`, `due_date`, `jurisdiction_rule`), then `scheduleReminders(kind:'deadline_reminder')`.
**Note current gap:** a rule→deadline materializer isn't wired yet — this is *new* deterministic
code, small. Purely rule-based (e.g. "written statement 30/90d from summons", "appeal limitation"),
so it stays `[D]`; the LLM never sets a legal deadline.

### Stage 4 — Closed cases + judgments by advocate `[D]`
Source: `corpus-athena.ts`. Today `caseDetailByCnr` exposes `pet_advocate`/`res_advocate`; add a
sibling `searchCasesByAdvocate(name)` that scans `case_details WHERE lower(pet_advocate) LIKE ? OR
lower(res_advocate) LIKE ?` (advocate **name**, since the corpus has no bar #), then joins
`judgments_all` on `cnr` for the judgment + `judgmentPdfUrl`. Surfaced as a "Closed cases &
judgments" read-model the advocate can promote to a managed `matter` (status `disposed`) on demand.
Honest coverage caveat shown (partial HC/SC coverage). Resumable + cheap (Athena ResultReuse 60m).

### Stage 5 — Inbox sweep `[D]` + `[LLM]`
Reuse `mail/ingest.ts:ingestMail(..., backfillCount)` — fetch (deterministic), extract text
(deterministic), **classify (LLM, via `classifyDocument`/`complete.ts`)**, dedupe by
`gmail_id` and document `content_hash` (deterministic). No change needed to onboard; we just call
it in backfill mode for the first N messages. Low confidence → `needs_review` (already enforced by
`CONFIDENCE_THRESHOLD`). Keyless path: `scripts/classify-worker.ts` handles tenants with no API key.

### Stage 6 — Auto-attach to the right open case `[D]` (matcher detailed in §5)
Reuse `docs/autofile.ts:resolveFiling`. Extend with an explicit identifier-ranked matcher and run
it over **both** newly-ingested docs and **already-in-system unattached docs** (`document` where
`matter_id is null`). Every attach writes an `audit_event`. Strictly deterministic — the LLM only
*supplied* the extracted CNR/parties upstream; the *match* is code.

### Stage 7 — AI briefing per open case `[LLM]`
Reuse `docs/case-summary.ts` (`buildCaseSummaryPrompt` + `CASE_SUMMARY_SCHEMA` + `completeJson`).
For each open matter, generate `{summary, posture, key_points, next_steps, risk_flags}` grounded
strictly in the record, store on `matter.ai_summary` (`0003_case_ai.sql`). Run async/queued so it
never blocks onboarding; stale-record flagging is already in the prompt.

### Stage 8 — AI workbench (on demand) `[LLM]`
Reuse the Lawyer Agent (`services/agent/agent.ts:askAgent` → `retrieve` → `synthesize`). Pre-pin a
thread to each matter (`agent_thread.matter_id`) so the advocate can immediately ask "next actions",
"what to present", "arguments" and get cited answers grounded in matter + law pack
(`legal_reference`) + open-corpus precedent (`searchJudgmentsByTerms`). `retrieve` already pulls
hearings/docs/orders/precedent. We add 2–3 **canned prompts** ("Draft my next-hearing checklist",
"Strongest arguments on the record", "What to carry to court") that are just pre-filled `askAgent`
calls — no new pipeline.

### Stage 9 — Auto-draft, human-gated `[LLM]`
Where the collected data makes it possible (e.g. a §138 reply, a vakalatnama, a short application,
a notice escalation), produce a **DRAFT** via `completeText`, following the `reply.ts` pattern
(grounded-only, "this is a DRAFT for the advocate", never auto-send). Store as a `document`
(`doc_type='draft'`) or a `notice` row in a draft state. **Hard gate:** generation is allowed; send
is a separate, explicit human action (Resend/Notice flow). The LLM never finalizes or dispatches.

## 4. "Attach to calendar + refresh" mechanics (reuse, don't rebuild)

- **Attach to calendar:** there is no separate "attach" step — `upsertCase` (Stage 2) writes
  `hearing` rows and sets `matter.next_hearing_date`; the calendar page (`dashboard/calendar`)
  already unions `hearing` + `cause_list_entry` + `deadline` + `calendar_event` into `CalEvent`s.
  So syncing a case *is* putting it on the calendar.
- **Reminders:** `upsertCase` already calls `scheduleReminders` (T-3/T-1/day-of, idempotent on
  `(tenant, ref, scheduled_for, channel)`, clears+reschedules on change). Stage 3 reuses the same
  helper for deadlines.
- **Keep refreshed:** the existing daily cron (`api/cron/causelist`) + a per-CNR refresh sweep
  through `refreshCasesCached`/`getCaseCached(force)` (gateway TTL 12h, stale-fallback). Onboarding
  adds nothing new here except enrolling the new advocate's CNRs into the refresh set. HITL refresh
  (`court_refresh_request` + `submitRefreshRequest`) covers the CAPTCHA-blocked cases; its parse→
  `upsertCase` step is the one TODO already noted in `court-actions.ts`.

## 5. Inbox → case auto-attach matching design

Runs in Stage 6 over two inputs: (a) docs just ingested from Gmail, (b) existing `document` rows
with `matter_id is null`. Built on `resolveFiling`, with an explicit **identifier-ranked** resolver
so matching is deterministic and explainable.

**Identifier precedence (strongest → weakest), each with a confidence:**
1. **CNR exact** (1.0) — `document.extracted.cnrs[0]` (16-char, validated by the `causelist-parse`
   CNR regex) `= matter.cnr`. Unambiguous; auto-attach.
2. **Sender = known client contact** (0.9) — `matchClientByContact` (already in `autofile.ts`):
   email/phone → `client.id`; if that client has exactly one open matter, attach to it; else attach
   at client level and queue case-pick.
3. **Court case number** (0.8) — registration number (e.g. "C.S. 1234/2022") parsed from text vs
   `matter.detail.registrationNumber` / `case_number`. Requires court+number both to match.
4. **Party-name overlap** (0.5–0.7) — extracted party names vs `matter.party_names` (GIN-indexed),
   scored like `similar.ts` (overlap count, ignoring generic tokens "State", "Union of India").
   Two distinct non-generic party matches → attach; one → review.

**Confidence + gating:** `score ≥ CONFIDENCE_THRESHOLD (0.7)` → set `document.matter_id` (+
`client_id`), status `filed`, write `audit_event{action:'document.attached', identifier, score}`.
Below threshold → leave unattached / `needs_review` (no silent mis-filing). The strongest signal
wins; ties broken by precedence above.

**Dedup:** already enforced — `email_message` unique on `(tenant, gmail_id)`; `document` skipped on
`(tenant, content_hash)`. Re-running onboarding never double-attaches: attaching is an idempotent
`update` keyed on `document.id`, and an already-attached doc is skipped.

**"Already in the system" path:** the same matcher runs over `document where matter_id is null`
(e.g. docs filed to a client but no case yet) — newly-seeded matters from Stages 1–2 can now claim
older orphan documents. This is the "docs found in mail OR already in the system" requirement.

## 6. Terminal AI workflow (summary · next actions · present · arguments · draft)

All via the **provider-agnostic** layer (`ai/complete.ts`: `completeJson`/`completeText`, backend
chosen by env — Anthropic API / keyless CLI / OpenAI-compatible / DeepSeek), so it runs on Vercel
with a key *or* keyless via `classify-worker`.

| Output | Mechanism | LLM call | Grounding | Gate |
|---|---|---|---|---|
| Case summary | `docs/case-summary.ts` | `completeJson(CASE_SUMMARY_SCHEMA)` | matter record only | store on `matter.ai_summary`; read-only |
| Next actions | `case-summary.next_steps` + agent canned prompt | `completeJson`/`askAgent` | matter + hearings + deadlines | advisory, cited |
| What to present | agent canned prompt → `askAgent` | `completeJson` (agent) | matter + docs + orders | advisory, cited |
| Arguments | agent canned prompt → `askAgent` | `completeJson` (agent) | matter + `legal_reference` + open-corpus precedent | advisory, cited `[n]` |
| Auto-draft | `reply.ts` pattern → `completeText` | `completeText` | strictly the record | **DRAFT only — human confirms + sends** |

**Human-confirm gates (CLAUDE.md §5, non-negotiable):** summaries/answers are advisory and carry
the standing "not legal advice — verify against the official record and the bare act" footer
(already in `prompt.ts`). Drafts are generated but **never sent**; sending is a separate explicit
action through the existing Notice/Resend flow. The LLM never sets a deadline, attaches a document,
deletes, or dispatches — those are all deterministic code paths with the human in the loop.

## 7. Phased build order (smallest shippable slice first)

| Phase | Slice | Exists | New |
|---|---|---|---|
| **A (first slice)** | **Onboarding orchestrator over what already works:** advocate capture → cause-list pull → per-CNR `upsertCase` (calendar+reminders auto) → inbox backfill+autofile → per-case AI summary. Wire as a resumable run with a progress UI. | `addAdvocate`, `getCauseList`+cron, `getCaseCached`+`upsertCase`+`scheduleReminders`, `ingestMail`+`resolveFiling`, `case-summary`, `complete.ts` | `onboarding_run` table (cursor/stage) + RLS; the orchestrator action; the progress UI |
| **B** | **Identifier-ranked auto-attach** over mail + orphan docs (§5); audit + review queue. | `resolveFiling`, `matchClientByContact`, `similar.ts` scoring, `audit_event` | the ranked matcher + the "claim orphans" sweep |
| **C** | **Closed cases + judgments by advocate** (Stage 4). | `corpus-athena`, `judgmentPdfUrl` | `searchCasesByAdvocate` + the read-model UI + promote-to-matter |
| **D** | **Deadline materializer** from `deadline_rule` (Stage 3). | `deadline`/`deadline_rule` tables, `scheduleReminders` | rule→deadline engine |
| **E** | **AI workbench + gated auto-draft** (Stages 8–9): canned agent prompts + draft generation. | `askAgent`/`retrieve`, `reply.ts`, `completeText` | canned-prompt UI + draft→`document`/`notice` (no send) |
| **F** | **HITL refresh parse** (closes the CAPTCHA gap): parse pasted payload → `upsertCase`. | `submitRefreshRequest`, `hitl-parse.ts`, `upsertCase` | wire `hitl-parse` output into `upsertCase` |

## 8. New artifacts required (everything else is reuse)

- `onboarding_run` table (tenant-owned, **4 RLS policies**, keyed to `current_tenant_id()`):
  `advocate_id`, `stage`, `cursor jsonb`, `counts jsonb`, `status`, timestamps.
- An orchestrator server action / `api/onboarding` route that runs Stages 0–7 idempotently, writes
  the cursor, and is safe to re-invoke (Vercel-timeout-resumable; keyless-worker-compatible for AI).
- `searchCasesByAdvocate(name)` in `corpus-athena.ts` (Stage 4).
- The identifier-ranked matcher extension to `autofile.ts` (Stage 6) + orphan-doc sweep.
- The `deadline_rule` → `deadline` materializer (Stage 3).
- Canned agent prompts + draft generation surface (Stages 8–9).

---

## Summary (~15 lines)

- The flow: **bar number → open cases (parties/hearings/deadlines on the calendar, kept refreshed)
  → closed cases + judgments → inbox auto-attach by CNR/case-no/parties → AI summary, next actions,
  what to present, arguments, gated auto-draft.**
- **Compliance reality (be honest):** no compliant automated source returns an advocate's live
  OPEN cases by bar number — that path is CAPTCHA-scraping, which we refuse. We approximate from
  **cause-list + manual CNR add + HITL refresh** and mark provenance everywhere.
- **Closed cases/judgments** *are* compliantly available: the open judgments corpus via Athena,
  searched by advocate **name** (not bar #), partial-coverage caveat shown.
- **Determinism first:** code does capture, cause-list seed, per-CNR sync, calendar+reminder
  scheduling, deadline rules, identifier matching, attaching, and dedup. The **LLM is reserved**
  for document classification, case summaries, agent answers, and drafting.
- **Reuse is the story:** `upsertCase` already writes hearings + schedules reminders (calendar =
  free); `ingestMail`+`resolveFiling` already file mail; `case-summary`/`agent`/`complete.ts`
  already do the AI, provider-agnostic and keyless-capable.
- **Human gates:** summaries/answers are advisory + cited; drafts are generated but **never sent**;
  the LLM never sets a deadline, attaches, deletes, or dispatches.
- **Mostly-new pieces:** an `onboarding_run` cursor table (+4 RLS policies), the resumable
  orchestrator, `searchCasesByAdvocate`, the identifier-ranked matcher, and the deadline
  materializer. Everything else is wiring existing parts together.

### Recommended first slice to implement (Phase A)

Ship the **onboarding orchestrator over what already works**: add a small resumable `onboarding_run`
table (with its 4 RLS policies) + one orchestrator action that runs, idempotently and in order:
`addAdvocate` → `getCauseList` seed (`cause_list_entry` + seed `matter`) → `getCaseCached` →
`upsertCase` per CNR (**which already puts hearings on the calendar and schedules reminders**) →
`ingestMail` backfill (autofile via `resolveFiling`) → per-case `case-summary`. Surface a progress
view reading the run cursor. This delivers the end-to-end experience using zero new court-data
sources and zero new AI plumbing, honestly labels the open-case approximation, and gives the next
phases (ranked auto-attach, corpus closed cases, deadline rules, AI workbench, gated drafts) a
stable spine to hang off.
