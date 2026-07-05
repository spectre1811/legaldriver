# Matter soft-delete via the RLS SELECT policy (WO-43-W2)

**Date:** 2026-07-06 · **Status:** accepted · **Scope:** `matter` table + Cases list bulk delete

## Context
WO-43-W2 makes the Cases list selection-first with a reversible bulk delete (soft-delete + 10s undo),
matching the WO-27 Documents pattern. That needs a way to mark a matter "trashed" without losing it,
and to hide trashed matters everywhere they're read. `matter` is read in **~53 places** across the app
(lists, calendar, dashboard, search, autofile, retrieval, crons).

## Decision
Add a nullable `matter.deleted_at timestamptz` and filter it **once, in the RLS SELECT policies**
(`matter_select` for the tenant surface, `matter_portal_sel` for the client portal) rather than at each
of the 53 read sites.

- Every RLS-scoped read (the browser/server clients) then excludes trashed matters automatically — a
  new list can't forget the filter and leak deleted cases onto the calendar/dashboard.
- The **service-role/admin** client bypasses RLS, so those reads are filtered explicitly in code with
  `.is("deleted_at", null)`: cron `refresh`, cron `causelist`, court `capture`, and the doc/mail/message
  filing paths (`file-upload`, `mail/ingest`, `messaging/ingest`, `autofile`, `attach`). This prevents
  re-syncing a trashed case or auto-filing a new document into an invisible one.
- The **UPDATE/DELETE** policies are left tenant-only (not filtered on `deleted_at`) so an owner can
  still restore (`deleted_at := null`) or hard-purge a trashed row the SELECT policy hides.
- A partial index `matter (tenant_id) where deleted_at is null` keeps the hot "live cases" path cheap.

## Alternatives rejected
- **Filter at all 53 read sites** — fragile; one missed site silently leaks deleted cases as if real
  (exactly the "wrong data shown as truth" class the org guards against).
- **JSON marker like Documents' `extracted->>deletedAt`** — Documents has a spare `extracted` jsonb;
  `matter.detail` is not spare (it's overwritten every sync, which would resurrect a deleted case), and
  a real column is indexable and RLS-referenceable.
- **Deferred hard-delete (no column)** — only reversible inside the 10s window; the founder chose a
  persistent, recoverable trash.

## Consequences / follow-ups
- **Founder-gated migration** (RLS/tenancy): applied to the linked Supabase project before merge; types
  regenerated with `npm run db:types` afterward (the code uses a narrow cast until then).
- No Trash *view* yet — restore is via the 10s undo only. A "Trash" filter + purge is a W4 follow-up.
- `deleted_at` should ride any future "who deleted it" audit column if per-user attribution is wanted.
