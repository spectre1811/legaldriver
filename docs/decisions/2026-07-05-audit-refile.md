# Audit-refile — re-file unfiled documents as clients & cases grow (WO-33 W4)

**Date:** 2026-07-05 · **Status:** **accepted** (non-gated; no schema/migration, no RLS/auth/billing) · **Work order:** WO-33 (W3 tail) · **Plan ref:** `exec/work-orders/WO-33-document-intake-engine.md` §Waves W3, founder ask 2026-07-04 ("segregate automatically **+ continuously**")

## Context

The Filing Clerk matches a document to a client/case at ingest. But a document that arrives *before*
its client or case exists in the system has nothing to match against, so it lands unfiled in the
Review Inbox and stays there — even after the advocate later adds that very client/case. The intake
was a one-shot at ingest; the founder asked for continuous segregation.

## Decision

Add an **audit-refile** loop that re-derives filing for unfiled / `needs_review` documents against
the **current** clients & cases, on a daily cron **and** on-demand ("Re-scan for matches" in the
Review Inbox). It reuses the existing `resolveFiling` — deepen, don't duplicate — via a new
**match-only** mode, and applies `decideRefile`, which mirrors `decideFiling`'s structural-confidence
rule:

- **`matchOnly`** (`resolveFiling` opt): an unattended re-scan may only **link to existing** clients
  / cases; it can **never create** one. This is the safety property — a batch job that could spawn
  clients/matters would multiply any classifier error across the whole backlog.
- **Strong vs fuzzy** (`FilingResult.clientStrong`/`matterStrong`): a match from a **deterministic**
  signal (LLM shortlist id, sender contact, exact name / CNR / title) is trustworthy → **auto-file**
  (the doc leaves the queue, provenance `extracted.refiledBy: "audit"`). A **fuzzy** party-name match
  is not → it only **refreshes the review suggestion** (`extracted.refileSuggest*`), which the Review
  Inbox pre-fills for one-tap human confirm. Never a silent mis-file.

No migration: state rides in the existing `document.extracted` JSON (same tactic as WO-27's reversible
delete and WO-33 W1's `status`). The cron uses the service-role client but **every** query filters by
`tenant_id` (never cross-tenant).

## Why not

- **Auto-file fuzzy matches too** — rejected: a 0.55 trigram match is exactly the "propose, don't
  force" case the guardrail exists for; unattended, at backlog scale, it would bury mis-files.
- **A `learned_mappings` table** (sender/party → client/case, remembered from corrections) — deferred:
  it needs a founder-gated migration. Tracked as the remaining WO-33 W3 item.

## Consequences

`resolveFiling` gains two boolean provenance flags + a `matchOnly` opt (inline callers unaffected).
The Review Inbox surfaces re-found matches with a "New match" badge. No contract others depend on, no
schema — per protocol §10 this is a "skip the spec" change (work-order criteria suffice).
