import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCourtDataClient } from "@/lib/court/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Lazy-load an order's extracted full text on demand (the case page's "View full text" toggle).
// The text lives on the court-data platform (not our DB), so we resolve the platform order id +
// the matter's CNR from the user's OWN tenant (RLS via the session client) and fetch it. Cheap +
// resilient: nothing loads until the user asks, and it never blocks the case page.
export async function GET(request: NextRequest) {
  const orderRowId = request.nextUrl.searchParams.get("order");
  if (!orderRowId) return NextResponse.json({ error: "missing order" }, { status: 400 });

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // RLS-scoped: the caller only sees their own tenant's court_order + the linked matter's CNR.
  const { data: row } = await supabase
    .from("court_order")
    .select("raw, matter:matter_id ( cnr )")
    .eq("id", orderRowId)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const scraperOrderId = (row.raw as { order_id?: unknown } | null)?.order_id;
  const matter = row.matter as { cnr?: string | null } | null;
  const cnr = matter?.cnr;
  if (!scraperOrderId || !cnr) return NextResponse.json({ text: null });

  try {
    const order = await getCourtDataClient().getOrder(cnr, String(scraperOrderId));
    return NextResponse.json({ text: order?.markdown ?? null });
  } catch {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }
}
