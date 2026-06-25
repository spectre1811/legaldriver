import { NextResponse, type NextRequest } from "next/server";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// TEMP diagnostic — dumps the raw eCourtsIndia response for a CNR so we can fix the
// adapter field-mapping. CRON_SECRET-gated. Remove after diagnosis.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cnr = new URL(request.url).searchParams.get("cnr");
  if (!cnr) return NextResponse.json({ error: "cnr required" }, { status: 400 });

  const base = process.env.ECOURTSINDIA_BASE_URL ?? "https://webapi.ecourtsindia.com";
  const token = process.env.ECOURTSINDIA_API_TOKEN ?? "";
  const path = `/api/partner/case/${encodeURIComponent(cnr)}`;
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    const text = await res.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* keep text */ }
    return NextResponse.json({ url: `${base}${path}`, status: res.status, body });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "fetch failed" });
  }
}
