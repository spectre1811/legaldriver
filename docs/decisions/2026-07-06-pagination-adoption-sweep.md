# Pagination adoption sweep — every growable list on the WO-39 primitive (WO-56)

**Date:** 2026-07-06 · **Status:** accepted · **Scope:** advocate/judge dossiers, portfolio, documents, inbox, messages, client-detail

## Context
WO-39 shipped the pagination primitive (`src/lib/paginate.ts` + `<Pagination>`) and adopted it on a
few heroes (Cases, Clients, Notices, Voice). Adoption then **lagged the primitive**: the founder
(2026-07-06) opened the **advocate dossier** — a page that clearly needs paging — and found none at all.
An audit surfaced seven large, growable lists still rendering a bare `.limit(N)` fetch-all or a
`.slice(0, N)` that hides the real size.

## Decision
Retrofit all seven onto the shared primitive. Two mechanical patterns, one nuance each:

- **Supabase-backed lists** (documents, inbox, messages, client-detail matters + docs) → numbered-page
  pagination: `.range(from, to)` + `{ count: "exact" }` + `<Pagination>`. The bare caps
  (`.limit(300/200/300)` and the unbounded matters query) are gone; the whole list is reachable and the
  true total is stated. A filter change resets to page 1 (`FilterBar` drops `page`).
- **`/v1` API-array dossiers** (advocate, judge) → the analytics still aggregate over the **whole**
  returned array; only the **table** is windowed in memory (`array.slice(from, to + 1)` + `<Pagination>`),
  which bounds the DOM immediately while the header keeps the honest "showing N of M". The fetch itself
  is still whole-array — the proper fix is a `/v1` server-side paging contract, **filed as a follow-up**
  (BACKLOG §D). The tracked-matter lookup is now scoped to the on-screen page, not the whole roster.
- **Portfolio** is a risk *dashboard*, not a browsable list, so pagination doesn't fit. Its two
  fetch-all scans (`matter … .limit(1000)`, `document … .limit(3000)`) are replaced (`portfolio-query.ts`)
  by **bounded + indexed** queries: the open-status filter is pushed into SQL (nulls treated as open, to
  match the old JS regex), the open-caseload scan is capped at a **named constant with an honest overflow
  banner** (no silent truncation), and "latest document per matter" is fetched only for the handful of
  at-risk candidates instead of every document in the tenant.

### Shared-primitive change
`<Pagination>` gained optional `pageKey`/`perKey` props (default `page`/`per`) so one page can host two
independent paginated lists — needed for client-detail (matters on `page`/`per`, documents on
`dpage`/`dper`). Backward-compatible: the four existing callers pass no keys and are unchanged.

## Alternatives considered
- **Client-side "load more" windowing of the dossier arrays** — rejected: the old `<PaginatedList>`
  loader was already retired in favour of numbered pages; numbered pages give a true total + bookmarkable
  URL and reuse the one primitive.
- **A `COALESCE(override, hearing)` generated column + index for portfolio** (a true count-based
  dashboard with no scan) — the correct long-term fix, but it needs a **founder-gated migration**. Deferred
  to §D; the bounded scan here is correct (the coalesce is applied in JS over the open set) and honest.
- **Thread-level paging for messages** (a thread never split across pages) — needs a thread-aggregation
  view; deferred to §D. Interim: paginate messages newest-first, grouped per page, stated honestly.

## Consequences
- No bare `.limit(300/200/1000/3000)` fetch-all remains on the swept surfaces; `tests/wo56_pagination_adoption.ts`
  (offline gate) locks this in and blocks the next un-paginated list from shipping.
- Follow-ups filed in BACKLOG §D: (a) `/v1` advocate/judge server-side paging; (b) portfolio effective-hearing
  generated column → count-based dashboard; (c) message thread-level paging. Portal-chat `.limit(100)` on
  client-detail is left as-is (secondary widget, out of this WO's audit) and noted.
