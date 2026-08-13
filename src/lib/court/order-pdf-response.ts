// WO-68 · Pure decision for the keyed order-PDF proxy (`/api/court/order-pdf`): given the box's
// `/order/{id}/pdf` response, what should we show the advocate? Extracted so the exact regression
// can be unit-tested (the route itself streams bytes / renders HTML, which is hard to assert on).
//
// The bug this fixes: BP-75 made the box answer a definitive "no PDF on the eCourts record" as a
// clean `200 {status:"unavailable"}` (JSON, no `object_key`). The keyed route only knew how to
// stream `application/pdf` bytes — so that honest terminal state failed its content-type check and
// rendered as "Couldn't open this order's PDF — try again shortly" (503). The advocate then clicked
// forever on a document that will never exist. This is the same dead-end BP-75 already removed on
// peshi-search (`resolveOrderFetch`); WO-68 removes it on the authed legaldriver surface.
//
// Outcomes:
//   stream       — real PDF bytes came back → proxy them through.
//   unavailable  — TERMINAL: no PDF is on the eCourts record for this order (never a retry prompt).
//   exhausted    — WO-376 W3: TERMINAL, but NOT the same claim as `unavailable`. The fleet spent its
//                  retry budget on AMBIGUOUS failures (WAF blips, upstream races, missing request
//                  params) without eCourts ever confirming absence — the document may still exist, we
//                  just could not retrieve it. Must never render with `unavailable`'s "no document on
//                  record" copy (that conflation is exactly the bug this WO exists to fix — see
//                  ecourts-scraper's `case_service._pdf_task_exhausted`).
//   retrieving   — a district order's copy is being fetched async from the portal (202) → poll/retry.
//   notFound     — the box doesn't know this order id (404) → it's not on the court record.
//   serviceError — a genuine transient failure (5xx / network / unexpected shape) → the ONLY case
//                  that shows a retriable "try again shortly".

export type OrderPdfOutcome = "stream" | "unavailable" | "exhausted" | "retrieving" | "notFound" | "serviceError";

export function isPdfContentType(contentType: string | null | undefined): boolean {
  return /pdf|octet-stream/i.test(contentType ?? "");
}

// `bodyStatus` is the `status` field of a non-PDF JSON control response (only read when the response
// isn't PDF bytes). `res.ok` mirrors `Response.ok` (2xx). Order matters: a definitive terminal
// answer must win over the generic "something's off" fallback.
export function classifyOrderPdf(
  res: { ok: boolean; status: number; contentType: string | null | undefined },
  bodyStatus?: string,
): OrderPdfOutcome {
  if (res.ok && isPdfContentType(res.contentType)) return "stream"; // real bytes
  if (res.ok && bodyStatus === "unavailable") return "unavailable"; // terminal: no doc on record
  if (res.ok && bodyStatus === "exhausted") return "exhausted"; // terminal: gave up, NOT confirmed absent
  if (res.status === 202 || bodyStatus === "queued") return "retrieving"; // district async fetch
  if (res.status === 404) return "notFound"; // order id unknown to the box
  return "serviceError"; // 5xx / network / an unexpected 200-non-PDF shape → retriable
}
