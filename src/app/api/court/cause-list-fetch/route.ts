import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requestCauseListFetch, hasOnDemandCauseList } from "@/lib/court/legaldriver";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// WO-205 W3 · On-demand cause-list fetch (server seam — the keyed X-API-Key never reaches the
// browser). The board client island calls THIS route on a District miss; it proxies to the W2
// endpoint `POST /v1/cause-lists/fetch {court_id, date}` and hands back a normalized outcome the
// island's pure state machine maps (200 found/empty · 202 fetching · 422 not-a-record/HC). Auth-
// guarded (any signed-in advocate — the keyed lane is the founder-opened console surface, FG-6).
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // No live lane wired (mock provider, or W2 not in prod yet) → tell the island to fall to the
  // honest-empty state. Never enqueue against a lane that can't run.
  if (!hasOnDemandCauseList()) return NextResponse.json({ status: "empty" }, { status: 200 });

  let body: { court_id?: unknown; date?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const courtId = typeof body.court_id === "string" ? body.court_id : String(body.court_id ?? "");
  const date = typeof body.date === "string" ? body.date : "";
  if (!courtId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "court_id and a valid date are required" }, { status: 400 });
  }

  // Proxy the enqueue. The client cares only about the status class (found/fetching/empty/error) —
  // pass the platform's HTTP status straight through so the island's pure mapper decides.
  const result = await requestCauseListFetch(courtId, date);
  return NextResponse.json({ status: result.status, hasItems: result.hasItems }, { status: 200 });
}
