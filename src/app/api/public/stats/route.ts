import { NextResponse, type NextRequest } from "next/server";
import { allow, clientIp, scraperApiBase } from "@/lib/security/rate-limit";

// WO-326 · Same-origin server-side proxy to the ecourts-scraper public corpus stats
// (`/v1/public/stats`) for the mukadma.in apex coverage strip. Pass-through response shape
// (pinned for WO-324): { cases_indexed: number, courts: number, states: number, updated_at: string
// | null } (+ optional schema_version) — the exact `PublicStats` shape peshi's api.ts already
// consumes, unmodified (ship-invariant #1: one contract).
//
// The outbound fetch is Next-cached at `revalidate` (mirrors peshi's getPublicStats: the number
// moves slowly, so the landing's "55M+" is live but not re-fetched per request).
export const revalidate = 3600;

const UPSTREAM_TIMEOUT_MS = 8000;

export async function GET(req: NextRequest) {
  const ip = clientIp(req);
  if (!allow(`public-stats:${ip}`, 60)) {
    return NextResponse.json({ error: "too many requests" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  let base: string;
  try {
    base = scraperApiBase();
  } catch (e) {
    console.error("[public-stats]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "stats temporarily unavailable" }, { status: 500 });
  }

  try {
    const res = await fetch(`${base}/v1/public/stats`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      next: { revalidate },
    });
    if (!res.ok) {
      const status = res.status === 429 || res.status === 503 ? res.status : 502;
      const retryAfter = res.headers.get("retry-after");
      return NextResponse.json(
        { error: "stats temporarily unavailable" },
        { status, headers: retryAfter ? { "Retry-After": retryAfter } : undefined },
      );
    }
    const data = await res.json();
    return NextResponse.json(data, { headers: { "Cache-Control": `public, max-age=${revalidate}` } });
  } catch {
    // Timeout / network failure — bounded honest 503, never a fabricated/stale-looking number.
    return NextResponse.json({ error: "stats temporarily unavailable" }, { status: 503, headers: { "Retry-After": "60" } });
  }
}
