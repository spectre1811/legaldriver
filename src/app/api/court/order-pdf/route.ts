import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { classifyOrderPdf, isPdfContentType } from "@/lib/court/order-pdf-response";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LD_BASE = () => process.env.LD_API_BASE || "http://13.202.148.71:8080";

function page(title: string, body: string, matterId?: string | null, status = 200) {
  const back = matterId
    ? `<a href="/dashboard/cases/${matterId}" style="display:inline-block;margin-top:14px;padding:8px 14px;background:#4f46e5;color:#fff;border-radius:8px;text-decoration:none">Back to the case</a>`
    : `<a href="/dashboard/cases" style="color:#4f46e5">Back to cases</a>`;
  const retry = status === 202 ? `<p style="color:#6b7280;font-size:13px">Refresh this page in ~30s.</p>` : "";
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
     <div style="font-family:system-ui,sans-serif;max-width:520px;margin:12vh auto;padding:0 20px;color:#1f2937;text-align:center">
       <div style="font-size:40px">📄</div><h1 style="font-size:19px;margin:10px 0 6px">${title}</h1>
       <p style="color:#6b7280;font-size:14px;line-height:1.5">${body}</p>${retry}${back}</div>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

// STREAM the order PDF from the stable /order/{id}/pdf endpoint at click-time — never
// store/serve a presigned URL (those expire in ~1h → AccessDenied). This proxies fresh
// bytes on every click, so links are permanent. 202 = district PDF still being fetched.
export async function GET(request: NextRequest) {
  const orderRowId = request.nextUrl.searchParams.get("order");
  if (!orderRowId) return page("Missing order", "No order was specified.");

  const supabase = createClient();
  const { data: order } = await supabase.from("court_order").select("id, matter_id, url, raw").eq("id", orderRowId).maybeSingle();
  if (!order) return page("Order not found", "This order is no longer on file.");

  const providerId = (order.raw as { order_id?: string | number } | null)?.order_id;
  const key = process.env.LD_API_KEY;
  const numeric = providerId != null && /^\d+$/.test(String(providerId));

  // Legacy orders from a previous provider have no resolvable id — offer a re-sync.
  if (!numeric || !key) {
    return page("No document available", "This order came from an earlier data source, so we can’t stream its PDF. Refresh the case to re-sync it from the current court source.", order.matter_id);
  }

  // District PDFs are fetched on demand: the first request returns 202 (queued) while the
  // worker pulls from the portal, then the same URL serves the bytes from S3 seconds later.
  // Poll a few times so the click resolves on the same request instead of dead-ending.
  let upstream: Response | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      upstream = await fetch(`${LD_BASE()}/order/${encodeURIComponent(String(providerId))}/pdf`, {
        headers: { "X-API-Key": key },
        signal: AbortSignal.timeout(Number(process.env.LD_API_TIMEOUT_MS ?? "55000")),
      });
    } catch {
      return page("Court service unavailable", "The court data service didn’t respond just now. Please try again shortly.", order.matter_id, 503);
    }
    if (upstream.status !== 202) break;
    if (attempt < 3) await new Promise((r) => setTimeout(r, 3500)); // wait for the on-demand fetch, then retry
  }

  if (!upstream) return page("Court service unavailable", "The court data service didn’t respond just now. Please try again shortly.", order.matter_id, 503);

  const ct = upstream.headers.get("content-type");
  // Fast path: real PDF bytes → stream them straight through (never buffer the body).
  if (upstream.ok && upstream.body && isPdfContentType(ct)) {
    return new NextResponse(upstream.body, {
      status: 200,
      headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="order-${providerId}.pdf"`, "cache-control": "private, max-age=300" },
    });
  }

  // Otherwise the box returned a small JSON control response (BP-75). Read its `status` so we can
  // tell a TERMINAL "no doc on the eCourts record" (200 {unavailable}) apart from a genuine transient
  // failure — the founder's "not able to view order pdf on some cases" was every one of these
  // rendering as a retriable error, so the click dead-ended forever.
  let bodyStatus: string | undefined;
  try {
    bodyStatus = ((await upstream.json()) as { status?: string } | null)?.status;
  } catch {
    /* non-JSON body (e.g. an upstream error page) → classify by status code alone */
  }

  switch (classifyOrderPdf({ ok: upstream.ok, status: upstream.status, contentType: ct }, bodyStatus)) {
    case "unavailable":
      // Terminal, honest, 200 — NOT an error and NOT a retry prompt (there is nothing to retry).
      return page("No document on the court record", "The eCourts record has no order PDF filed for this order. There’s nothing to open — the court didn’t publish a document here.", order.matter_id, 200);
    case "exhausted":
      // WO-376 W3: terminal, but honest about what actually happened — we tried repeatedly and could
      // not retrieve it. Unlike "unavailable" above, this is NOT a claim that the document doesn't
      // exist, so it must never say "no document on the court record".
      return page("Couldn’t retrieve this document", "We tried several times to fetch this order’s copy from the court portal and weren’t able to. This doesn’t mean the document doesn’t exist — we just couldn’t retrieve it. Please check back later.", order.matter_id, 200);
    case "retrieving":
      return page("Fetching the order…", "This district order’s copy is being retrieved from the court portal — it usually lands within a minute.", order.matter_id, 202);
    case "notFound":
      return page("Order not found", "This order isn’t on the court record anymore.", order.matter_id, 404);
    default:
      return page("Couldn’t open this order’s PDF", "The court data service is having trouble reaching the portal just now. Please try again shortly.", order.matter_id, 503);
  }
}
