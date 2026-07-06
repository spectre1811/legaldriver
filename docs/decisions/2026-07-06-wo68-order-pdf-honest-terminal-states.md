# WO-68 · Order-PDF proxy must show honest terminal states (keyed surface)

**Date:** 2026-07-06 · **Status:** shipped · **Session:** S-WO68-opus-20260706
**Priority:** P0 (founder via fleet board 2026-07-06) · **Branch:** `wt/WO-68` · **Gated?** no (no migration / no schema)

## Why
Founder: *"check the order pdf fetcher urgently … I am not able to view order pdf on some cases and not
able to fetch it on some cases which used to work earlier."*

This is the **legaldriver (authed) half** of the same complaint BP-75 already fixed on peshi-search.
The fetcher is **not down** — the live keyless health probe (BP-75) reads healthy:

```
GET /v1/public/health/order-pdf → 12 req · 6 served (50%) · 5 no-doc (unavailable) · 1 err (8.3%)  [24h]
```

The regression the founder felt was a **UX dead-end**, not an outage. BP-75 made the box answer a
*definitive* "no PDF on the eCourts record" as a clean `200 {status:"unavailable"}` (JSON, no bytes,
and it records a terminal marker so it won't retry-loop). peshi consumed that. **legaldriver never
did** — its `/api/court/order-pdf` route only knew how to stream `application/pdf`, so a
`200 {unavailable}` JSON failed the content-type check and fell into the generic **"Couldn't open this
order's PDF — try again shortly" (503)** branch. The advocate then clicked forever on a document that
will never exist ("not able to view order pdf on some cases"), indistinguishable from a real failure.

## What changed
- **New pure decision** `src/lib/court/order-pdf-response.ts` → `classifyOrderPdf(res, bodyStatus)`
  maps the box's response to one of `stream | unavailable | retrieving | notFound | serviceError`.
  Mirrors peshi's `resolveOrderFetch`; extracted so the exact regression is unit-testable
  (`tests/wo68_order_pdf.ts`, 21 offline assertions).
- **`/api/court/order-pdf/route.ts`** consumes it:
  - real PDF bytes → stream (unchanged fast path, body never buffered);
  - `200 {status:"unavailable"}` → an **honest terminal 200** page — *"No document on the court record …
    the court didn't publish a document here"* — **no retry prompt** (there is nothing to retry);
  - `202`/`{queued}` → the existing "Fetching the order…" page (district async portal fetch);
  - `404` → "Order not found";
  - everything else (5xx / network / **401 bad key** / unexpected shape) → the retriable
    "try again shortly" 503 — now the **only** case that invites a retry.

## Why this shape (guidance — don't re-introduce the dead-end)
The single load-bearing rule for any order-PDF surface: **a definitive "no document" must never render
as a retriable error, and a genuine transient failure must never render as "no document."** Confusing
the two is exactly the founder's bug in both directions — a terminal absence shown as "try again" is
the endless-retry trap; a transient blip shown as "no document on record" hides a PDF a retry would
serve. `classifyOrderPdf` is the one place that decision lives; route through it, don't hand-roll a
content-type check. Order matters: real bytes win, then terminal `unavailable`, then `retrieving`,
then `notFound`, and only then the retriable fallback.

## Scope / follow-up
- No migration, no dependency, no gate. legaldriver still consumes only the **keyed** `/v1/*` surface.
- The advocate still discovers `unavailable` *on click*. Surfacing `pdf_status` in the orders list /
  timeline so a known-no-doc order shows "no document on record" **without** a click needs the
  sync contract (`legaldriver.ts` → `court_order.raw`) to carry `pdf_status` from the box's
  `/v1/cases/{cnr}/orders` response. Filed to **BACKLOG §D** as a WO-68 follow-up (non-gated UI + a
  small contract addition). `has_pdf` alone is **not** a substitute — it means "not cached yet", and
  an on-demand fetch of an uncached order is legitimate, so gating the link on it would wrongly hide
  fetchable orders.
