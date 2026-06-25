import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseEcourtsCapture } from "@/lib/court/hitl-parse";
import { upsertCase } from "@/lib/court/sync";
import type { Database } from "@/lib/db/database.types";

export const dynamic = "force-dynamic";

// Human-in-the-loop court capture. The advocate solved the CAPTCHA on the official
// portal themselves; the bookmarklet POSTs the rendered page text here, authenticated
// by a per-tenant capture token. We parse it deterministically into court_cache +
// matter. We NEVER automate or bypass the CAPTCHA. Cross-origin (from ecourts.gov.in),
// so CORS is open — auth is the token, not cookies.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(request: NextRequest) {
  let body: { token?: string; url?: string; text?: string; html?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_payload" }, { status: 400, headers: CORS });
  }
  const token = body.token?.trim();
  const text = body.text || body.html || "";
  if (!token) return NextResponse.json({ ok: false, error: "missing token" }, { status: 401, headers: CORS });
  if (!text || text.length < 40) return NextResponse.json({ ok: false, error: "no page content captured" }, { status: 400, headers: CORS });

  const admin = createAdminClient();
  const { data: tok } = await admin.from("capture_token").select("tenant_id, revoked").eq("token", token).maybeSingle();
  if (!tok || tok.revoked) return NextResponse.json({ ok: false, error: "invalid or revoked token" }, { status: 401, headers: CORS });
  const tenantId = tok.tenant_id;

  const parsed = parseEcourtsCapture(text);
  if (!parsed.ok || !parsed.normalized) {
    return NextResponse.json({ ok: false, error: parsed.reason ?? "could not parse the page" }, { status: 422, headers: CORS });
  }
  const c = parsed.normalized;

  try {
    // Cache the captured normalized case (shared cache; service-role only).
    await admin.from("court_cache").upsert(
      { kind: "case", cache_key: c.cnr, provider: c.source, normalized: c as unknown as Database["public"]["Tables"]["court_cache"]["Insert"]["normalized"], fetched_at: c.fetchedAt },
      { onConflict: "kind,cache_key,provider" },
    );
    const { matterId, isNew } = await upsertCase(admin, tenantId, c);

    // Fulfil any pending human-refresh requests for this CNR.
    await admin.from("court_refresh_request").update({ status: "fulfilled", fulfilled_at: new Date().toISOString() })
      .eq("tenant_id", tenantId).eq("cnr", c.cnr).eq("status", "pending");
    await admin.from("capture_token").update({ last_used_at: new Date().toISOString() }).eq("token", token);
    await admin.from("audit_event").insert({ tenant_id: tenantId, action: "court.hitl_capture", entity: "matter", entity_id: matterId, after: { cnr: c.cnr, next_hearing_date: c.nextHearingDate } });

    return NextResponse.json({ ok: true, cnr: c.cnr, title: c.title, matterId, isNew, nextHearingDate: c.nextHearingDate ?? null }, { headers: CORS });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "ingest_failed" }, { status: 500, headers: CORS });
  }
}
