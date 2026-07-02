import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  let upstream: Response;
  try {
    upstream = await fetch(`${LD_BASE()}/order/${encodeURIComponent(String(providerId))}/pdf`, {
      headers: { "X-API-Key": key },
      signal: AbortSignal.timeout(Number(process.env.LD_API_TIMEOUT_MS ?? "55000")),
    });
  } catch {
    return page("Court service unavailable", "The court data service didn’t respond just now. Please try again shortly.", order.matter_id, 503);
  }

  if (upstream.status === 202) return page("Fetching the order…", "This district order’s copy is being retrieved from the court portal now.", order.matter_id, 202);
  const ct = upstream.headers.get("content-type") ?? "";
  if (!upstream.ok || !upstream.body || !/pdf|octet-stream/i.test(ct)) {
    return page("Couldn’t open this order’s PDF", "The court may not publish a PDF for this order, or the portal is throttling. Try again shortly.", order.matter_id, upstream.status === 404 ? 404 : 503);
  }
  // Stream the fresh bytes straight through.
  return new NextResponse(upstream.body, {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="order-${providerId}.pdf"`, "cache-control": "private, max-age=300" },
  });
}
