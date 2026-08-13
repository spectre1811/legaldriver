// WO-68 · Keyed order-PDF proxy decision. The founder: "not able to view order pdf on some cases…
// which used to work earlier." Root cause: BP-75 made the box answer a definitive "no PDF on the
// eCourts record" as a clean `200 {status:"unavailable"}` (JSON, no bytes), but the legaldriver
// route only knew how to stream `application/pdf` — so that honest terminal state fell into the
// "Couldn't open — try again shortly" (503) branch and the advocate clicked forever on a document
// that will never exist. `classifyOrderPdf` is the pure decision that separates the four real
// outcomes so ONLY a genuine transient failure shows a retry prompt.
//
// Run: npx tsx tests/wo68_order_pdf.ts

import { classifyOrderPdf, isPdfContentType } from "../src/lib/court/order-pdf-response";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed++;
}

// ── isPdfContentType ─────────────────────────────────────────────────────────
ok("application/pdf is pdf", isPdfContentType("application/pdf"));
ok("octet-stream is pdf-ish (streamed bytes)", isPdfContentType("application/octet-stream"));
ok("pdf with charset param still pdf", isPdfContentType("application/pdf; charset=binary"));
ok("json is NOT pdf", !isPdfContentType("application/json"));
ok("html is NOT pdf", !isPdfContentType("text/html; charset=utf-8"));
ok("null content-type is NOT pdf", !isPdfContentType(null));
ok("undefined content-type is NOT pdf", !isPdfContentType(undefined));

// ── classifyOrderPdf: the streaming happy path ───────────────────────────────
ok("200 + pdf bytes → stream", classifyOrderPdf({ ok: true, status: 200, contentType: "application/pdf" }) === "stream");
ok("200 + octet-stream → stream", classifyOrderPdf({ ok: true, status: 200, contentType: "application/octet-stream" }) === "stream");

// ── THE regression: BP-75 terminal 'unavailable' must NOT read as an error ───
ok("200 json {unavailable} → unavailable", classifyOrderPdf({ ok: true, status: 200, contentType: "application/json" }, "unavailable") === "unavailable");
ok("unavailable is NOT stream", classifyOrderPdf({ ok: true, status: 200, contentType: "application/json" }, "unavailable") !== "stream");
ok("unavailable is NOT serviceError (no false retry)", classifyOrderPdf({ ok: true, status: 200, contentType: "application/json" }, "unavailable") !== "serviceError");

// ── WO-376 W3: 'exhausted' — TERMINAL, but NOT the same claim as 'unavailable' ────────────────────
// The scraper's dead-marker conflated "eCourts confirmed no such document" with "the fleet gave up
// after budget-exhausting AMBIGUOUS failures" — both used to render as "no document on the court
// record". `exhausted` is the split: honest that we could not retrieve it, without claiming absence.
ok("200 json {exhausted} → exhausted", classifyOrderPdf({ ok: true, status: 200, contentType: "application/json" }, "exhausted") === "exhausted");
ok("exhausted is NOT unavailable (must not claim confirmed absence)", classifyOrderPdf({ ok: true, status: 200, contentType: "application/json" }, "exhausted") !== "unavailable");
ok("exhausted is NOT stream", classifyOrderPdf({ ok: true, status: 200, contentType: "application/json" }, "exhausted") !== "stream");
ok("exhausted is NOT serviceError (no false 'try again shortly' retry prompt)", classifyOrderPdf({ ok: true, status: 200, contentType: "application/json" }, "exhausted") !== "serviceError");
// a non-ok response body carrying the same status string must NOT be read as the terminal state —
// only a genuine 200 control response from the box counts (mirrors the 'unavailable' precedent).
ok("502 body {exhausted} is NOT exhausted (res.ok gates it)", classifyOrderPdf({ ok: false, status: 502, contentType: "application/json" }, "exhausted") !== "exhausted");

// ── district async fetch (queued) ────────────────────────────────────────────
ok("202 → retrieving", classifyOrderPdf({ ok: false, status: 202, contentType: "application/json" }) === "retrieving");
ok("json {queued} → retrieving", classifyOrderPdf({ ok: true, status: 200, contentType: "application/json" }, "queued") === "retrieving");

// ── genuinely absent / transient ─────────────────────────────────────────────
ok("404 → notFound", classifyOrderPdf({ ok: false, status: 404, contentType: "application/json" }) === "notFound");
ok("502 → serviceError (retriable)", classifyOrderPdf({ ok: false, status: 502, contentType: "application/json" }) === "serviceError");
ok("503 → serviceError (retriable)", classifyOrderPdf({ ok: false, status: 503, contentType: "text/html" }) === "serviceError");
ok("401 (bad key) → serviceError, never 'no doc'", classifyOrderPdf({ ok: false, status: 401, contentType: "text/html" }) === "serviceError");

// ── ordering / defensive shape ───────────────────────────────────────────────
// A 200 that is neither PDF bytes nor a recognised control status must NOT masquerade as a doc or a
// terminal absence — it's an unexpected shape → retriable, so a transient box glitch never hides a
// real PDF behind "no document on record".
ok("200 json with no/unknown status → serviceError (retriable, not terminal)", classifyOrderPdf({ ok: true, status: 200, contentType: "application/json" }) === "serviceError");
ok("200 json {something-else} → serviceError", classifyOrderPdf({ ok: true, status: 200, contentType: "application/json" }, "weird") === "serviceError");
// A real PDF wins even if a stray status field rides along (bytes are bytes).
ok("200 pdf beats a stray body status", classifyOrderPdf({ ok: true, status: 200, contentType: "application/pdf" }, "unavailable") === "stream");

if (failed) {
  console.error(`\n${failed} assertion(s) FAILED`);
  process.exit(1);
}
console.log("\nwo68_order_pdf: all assertions passed");
