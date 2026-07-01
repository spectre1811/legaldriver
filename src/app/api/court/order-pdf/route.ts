import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCourtDataClient } from "@/lib/court/client";

export const dynamic = "force-dynamic";

// A friendly HTML fallback instead of raw JSON, with a route back to fixing it.
function page(title: string, body: string, matterId?: string | null, status = 200) {
  const back = matterId
    ? `<a href="/dashboard/cases/${matterId}" style="display:inline-block;margin-top:14px;padding:8px 14px;background:#4f46e5;color:#fff;border-radius:8px;text-decoration:none">Open the case &amp; press Refresh</a>`
    : `<a href="/dashboard/cases" style="color:#4f46e5">Back to cases</a>`;
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
     <div style="font-family:system-ui,sans-serif;max-width:520px;margin:12vh auto;padding:0 20px;color:#1f2937;text-align:center">
       <div style="font-size:40px">📄</div>
       <h1 style="font-size:19px;margin:10px 0 6px">${title}</h1>
       <p style="color:#6b7280;font-size:14px;line-height:1.5">${body}</p>
       ${back}
     </div>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

// On-demand order-PDF fetch. Signed URLs are short-lived, so we re-resolve live via
// the provider and redirect. Degrades to a friendly page — never raw JSON.
export async function GET(request: NextRequest) {
  const orderRowId = request.nextUrl.searchParams.get("order");
  if (!orderRowId) return page("Missing order", "No order was specified.");

  const supabase = createClient();
  const { data: order } = await supabase.from("court_order").select("id, matter_id, url, raw").eq("id", orderRowId).maybeSingle();
  if (!order) return page("Order not found", "This order is no longer on file.");

  const providerId = (order.raw as { order_id?: string | number } | null)?.order_id;
  const { data: matter } = await supabase.from("matter").select("cnr, source").eq("id", order.matter_id).maybeSingle();

  // A provider-order id that isn't numeric was synced by a previous provider
  // (e.g. eCourtsIndia) and can't be resolved through the current one — a re-sync
  // (Refresh) rewrites orders with resolvable ids.
  const numericId = providerId != null && /^\d+$/.test(String(providerId));
  if (order.url) return NextResponse.redirect(order.url);
  if (!numericId || !matter?.cnr) {
    return page("No document available", "This order was fetched from an earlier data source, so we can’t pull its PDF directly. Refreshing the case re-syncs it from the current court source.", order.matter_id);
  }

  const fetched = await getCourtDataClient().getOrder(matter.cnr, String(providerId));
  const url = fetched?.pdfUrl;
  if (url) {
    await supabase.from("court_order").update({ url }).eq("id", order.id);
    return NextResponse.redirect(url);
  }
  // No PDF returned — either the court publishes none for this order (common for
  // district orders) or the court data service is briefly unavailable. Honest about both.
  return page("Couldn’t open this order’s PDF", "The court may not publish a PDF for this order, or the court data service is briefly unavailable. Try again shortly, or refresh the case to re-sync.", order.matter_id, 503);
}
