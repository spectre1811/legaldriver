import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCourtDataClient } from "@/lib/court/client";

export const dynamic = "force-dynamic";

// On-demand order-PDF fetch. The order's signed URL is time-limited, so we resolve
// it live via the provider (LegalDriver /order/{id}/pdf — fetches from eCourts on
// miss + stores) and redirect. RLS (user session) scopes the court_order lookup.
export async function GET(request: NextRequest) {
  const orderRowId = request.nextUrl.searchParams.get("order");
  if (!orderRowId) return NextResponse.json({ error: "missing order" }, { status: 400 });

  const supabase = createClient();
  const { data: order } = await supabase.from("court_order").select("id, matter_id, url, raw").eq("id", orderRowId).maybeSingle();
  if (!order) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Already have a fresh-enough URL? (signed URLs expire ~1h; re-resolve to be safe.)
  const providerId = (order.raw as { order_id?: string | number } | null)?.order_id;
  const { data: matter } = await supabase.from("matter").select("cnr").eq("id", order.matter_id).maybeSingle();
  if (!providerId || !matter?.cnr) {
    if (order.url) return NextResponse.redirect(order.url);
    return NextResponse.json({ error: "no document available" }, { status: 404 });
  }

  const client = getCourtDataClient();
  const fetched = await client.getOrder(matter.cnr, String(providerId));
  const url = fetched?.pdfUrl ?? order.url;
  if (!url) return NextResponse.json({ error: "document could not be fetched" }, { status: 404 });
  // Cache the latest signed URL for a quick repeat (still re-resolved next expiry).
  await supabase.from("court_order").update({ url }).eq("id", order.id);
  return NextResponse.redirect(url);
}
