# Legaldriver — Project Context

A legal "daily driver" for advocates/firms: track court cases by CNR, see hearings +
jurisdiction-aware deadlines + the advocate cause list on one calendar, run legal-notice
escalation with reminders, and ingest Gmail so emails + attachments are auto-filed and
parsed against the right client/case. Full spec in `legal-mvp-build-brief.md`.

## Mukadma — operating rules (always in force, even without the kickoff prompt)
This repo is part of **Mukadma** (Indian legal-tech). The full ruleset + current work live in the exec
pack at `~/personal/legalmarketplace/plan/exec/`: **`00-OPERATING-PROTOCOL.md`** (governs everything),
`TRACKER.md` (in-flight), `BACKLOG.md` §A (what to pull next), `KICKOFF.md`, **`LEARNINGS.md`**
(cross-agent gotchas — read before non-trivial work). Facts/numbers come **only** from
`plan/context/00-INPUTS.md` — never invent them.
- **Plan-linked work only** — every task ties to a work order + a `TRACKER.md` row; **claim it (🟡 + session id) BEFORE editing — atomically via `new-wt.sh`** (it stamps the §A row IN-PROGRESS before the worktree exists; the pre-push hook blocks an unclaimed `wt/<WO>`). Never edit before the row is claimed (BP-60/BP-61 collisions).
- **Founder-gated → STOP + present before merge:** DB migrations, RLS/tenancy, auth, billing/payments.
- **Gates before "done":** `npm run typecheck` + `lint` + `build` + the relevant `tests/*.ts` — all green. No "done" with red/skipped.
- **Tests + types + docs in the SAME change;** update `TRACKER.md` + append `SESSION-LOG.md` per wave; promote reusable gotchas to `LEARNINGS.md`.
- **Small, in waves** — branch per work order (`wt/<id>`). Independent review is advisory (run it for risky/complex changes); **you self-merge your own PR once CI is green — don't wait for a reviewer to land it** (founder rule 2026-07-05). The hard gates are CI + the PR + the serialized merge queue + the `pre-push` hook.
- **Cheapest capable model** — Sonnet by default; Opus only for schema/RLS/security/product-wide-interface (say so).
- **No hacks** — diagnose the root cause; never disable a gate, swallow an error, or silently degrade.
- **Deploy discipline:** `main` **auto-deploys** to Vercel via native git-integration on merge (WO-09 ✅) — do **NOT** run `vercel --prod` manually. **Ship your own PR:** push `wt/<id>` → open a PR → CI green → **self-merge** (`gh pr merge <n> --merge`, or self-apply the **`automerge`** label) → it lands on `main` + deploys. **Always self-merge — never wait for a separate reviewer/integrator** (founder rule 2026-07-05). Env/crons are on the Vercel project.
- **CI/CD runs on our SELF-HOSTED runner** (2026-07-09; `runs-on: [self-hosted, mukadma]`, an ASG in `mukadma-infra`) — zero GitHub-hosted minutes, Actions budget **$0**. Coordination (automerge/branch-guardian) is unchanged; only the compute moved to our VPC. **Do NOT switch a workflow back to `ubuntu-latest`** — the free tier is spent until Aug 1, so a hosted job silently won't start. **If CI won't start, it's the runner, not the quota:** `gh api /repos/spectre1811/legaldriver/actions/runners` (expect `mukadma-*` online) → restart via `mukadma-infra` (SSM). **Exception:** `db-tests` stays GitHub-hosted (needs Docker for `supabase start`). Runbook: `mukadma-infra/docs/gha-runner-migration-plan.md`.
- **Parallel sessions run concurrently** — touch only your work order's files; edit only your own TRACKER/SESSION-LOG rows; flag shared-config (package.json/CI) changes first.

## Stack

Next.js 14 (App Router, TS) · Supabase (Postgres + RLS, Auth, Storage) · eCourtsIndia behind
a `CourtDataClient` interface · Gmail API (gmail.readonly) · Claude API for doc classify ·
Resend for email. Deploy on Vercel (P4).

## Repo map

| Path | What |
|---|---|
| `src/app/` | App Router pages. `login/`, `auth/` (callback+signout), `dashboard/` (overview, cases, calendar, notices, inbox). |
| `src/lib/supabase/` | `client.ts` (browser), `server.ts` (RLS server), `admin.ts` (service-role, RLS-bypassing — server-only), `middleware.ts` (session refresh + route guard). |
| `src/lib/db/database.types.ts` | **Generated** from the live schema. Single source of DB types — import, never hand-edit. Regenerate with `npm run db:types` (or the Management API). |
| `supabase/migrations/` | SQL migrations. `0001_init.sql` = schema + RLS + new-user bootstrap trigger. **New ones: `supabase migration new <slug>` (timestamped — never hand-pick the next `NNNN`, it collides across parallel WOs). `npm run check:migrations` / CI guards version-uniqueness (WO-41).** |
| `TASKBOARD.md` | Phase + workstream status. |

## Non-negotiable conventions

1. **Multi-tenant isolation via RLS on every tenant-owned table**, deny-by-default, keyed to
   `current_tenant_id()`. Never add a tenant-owned table without its 4 RLS policies. The
   service-role (`admin.ts`) bypasses RLS — only in trusted server jobs, and always filter
   by `tenant_id` manually there.
2. **Court data via the ecourts-scraper platform's internal API.** Scraping is the **settled org
   data strategy** (INPUTS §4; founder decision 2026-07-03) — the old "licensed-API-only / never
   scrape / never build a CAPTCHA solver" hard line is **superseded**. legaldriver itself consumes
   the platform's `/v1` internal API behind the `CourtDataClient` interface; the ecourts-scraper
   platform does the collection (CAPTCHA-free eCourts **mobile API** as the primary path, with a
   CAPTCHA web route only for district order PDFs). Provenance + "verify against the official
   record" disclaimer stay mandatory (conv. #3). See
   `docs/decisions/2026-07-03-scraper-sync-contract.md` (supersedes `2026-06-24-court-data-strategy.md`).
   **Two surfaces, split by consumer (BP-11 / founder ruling FG-2):** legaldriver consumes the
   **keyed `/v1/*`** surface (`X-API-Key`) — the full record: real order PDFs (streamed via the
   durable endpoint, never a persisted presigned URL), live-eCourts fallback, no suppression (the
   documented carve-out for the authed professional surface). The **public `/v1/public/*`** surface
   (cache-only, `has_pdf` boolean not raw URL, PII-suppressed) is for **peshi-search / SEO / MCP** —
   legaldriver never calls it. `src/lib/court/legaldriver.ts` hits only keyed `/v1/*`
   (`tests/wo01_sync_contract.ts` asserts this). Contract: ecourts-scraper
   `docs/decisions/2026-07-05-keyed-vs-public-v1-surface.md`.
3. **Provenance + disclaimer on all court data**: store `source` + `last_synced_at`, show
   freshness ("Source: the court record · last refreshed X") and "not legal advice — verify against
   the official record". **Product voice only (WO-132, founder directive 2026-07-13):** user-visible
   copy speaks of "the court record" / freshness stamps, **never** the pipeline — no "eCourts", "NIC",
   "NJDG", "scrape", or "crawl" on any user surface (i18n catalogs or copy components). The lone
   founder-approved exception is the HITL capture step's portal URL `services.ecourts.gov.in`
   (allowlisted). Enforced by `npm run guard:copy` (`scripts/no-source-mechanics.mjs`) in CI; add
   approved exceptions to `scripts/source-mechanics-allowlist.json`.
4. **No PII in logs.** Never log email bodies, tokens, or client data. OAuth refresh tokens are
   stored encrypted (Supabase Vault), referenced by `refresh_token_ref` — never in plaintext/logs.
5. **LLM infers, deterministic code verifies/files.** Claude classifies documents; it never
   auto-deletes or auto-sends. Low-confidence → `needs_review` queue.
6. **Secrets from env only**, never hardcoded. `.env.example` lists every key. `.env` is git-ignored.
7. **Providers behind interfaces**: `CourtDataClient`, `MailClient`, `Notifier`. Swappable impls
   (incl. a free mock provider for dev so we don't burn API credits).

## Build phases

See `TASKBOARD.md`. Ship + checkpoint after each: run it, show Yash, wait for go-ahead.
P0 foundations ✅ · P1 case tracking + calendar · P2 cause list + notices + notifications ·
P3 Gmail ingest + parsing · P4 polish + demo + deploy.

## Conventions inherited from the operator's setup

Per-project CLAUDE.md + TASKBOARD; GitHub Actions CI; `.env` git-ignored; skill authoring via
the **`skill-smith` agent** (`.claude/agents/skill-smith.md`; a pattern used 3×→a native `.claude/skills/`
skill); **OpenSpec** installed (`openspec/` + the `openspec-*` skills — spec-first per protocol §10);
model routing Sonnet-default, Opus for hard architecture.

## Cross-cutting skills — single source, NOT duplicated per repo (WO-38 decision)
Org-wide discipline skills live once in `~/personal/legalmarketplace/plan/exec/skills/` and are used
**by pointer** (never copied into repos, to avoid drift on load-bearing governance): `product-depth.md`,
`ui-polish-bar.md`, `information-integrity.md`, `repo-hygiene.md`, `ship-grade.md`. Read the relevant one
before the work it governs. Repo-local tooling skills (`.claude/skills/`) + the `skill-smith` agent ARE
native per repo — grow them here.

## ⚠️ Git flow — ENFORCED (see `plan/exec/INTEGRATION-DEPLOY.md`)
Parallel agents share this repo. **NEVER commit to / push / reset `main`.** Work in your own
`wt/<WO>` worktree — **start it with one command:** `plan/exec/new-wt.sh legaldriver <WO>` (fetches →
ff's local `main` → cuts `wt/<WO>` off fresh `origin/main` → wires hooks; never branch from a stale
local `main`). Then `git push origin
wt/<WO>`, **open a PR**, then **SELF-MERGE it once CI is green** — `gh pr merge <n> --merge`, or self-apply
the **`automerge`** label (`.github/workflows/automerge.yml`) which merges to `main` (serialized) → Vercel deploys.
**Founder rule (2026-07-05): always self-merge your own PR — never wait for a separate reviewer/integrator to
land it.** Self-merging *through a PR* is not "touching `main`" — you still never commit/push/reset `main`
directly (a `pre-push` hook blocks direct/force pushes; `branch-guardian` alarms on any force-move).
`plan/exec/integrate.sh` is only a fallback.
**New clone/worktree, run once:** `git config core.hooksPath .githooks` (`new-wt.sh` does this for you).

**⭐ Claim-first — ENFORCED (WO-47, 2026-07-05).** `new-wt.sh` **stamps the WO's `TRACKER.md` §A row 🟡 IN-PROGRESS BEFORE it creates the worktree**, and refuses if the WO is already claimed or its `wt/<WO>` branch exists — so you can never start editing an unclaimed WO (the exact BP-60/BP-61 duplicate-work bug). Set `MUKADMA_SESSION=<your session id>` first so the claim records you; back off cleanly with `new-wt.sh unclaim <repo> <WO>`. The **`pre-push` hook is the backstop** — it blocks pushing any `wt/<WO>` whose §A row isn't claimed (`plan/exec/claim.py check-branch`); `CLAIM_SKIP=1 git push …` overrides for a genuine non-WO branch. **Never hand-create a worktree and edit before the row is claimed.**
