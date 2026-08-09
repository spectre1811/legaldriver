import { NextResponse, type NextRequest } from "next/server";
import { allow, clientIp, scraperApiBase } from "@/lib/security/rate-limit";

// WO-326 · Same-origin server-side proxy to the ecourts-scraper public search surface
// (`/v1/public/search`) for the mukadma.in apex hero (founder decision (a): a proxy, not browser
// CORS, so `SCRAPER_API_BASE` stays server-only). WO-324 wires the landing hero to this once both
// land — this route ships standalone and does nothing to the landing itself.
//
// Response shape (pinned for WO-324):
//   { kind: string, q: string, count: number, total?: number, results: SearchRow[] }
// `results` rows are the upstream SearchRow AS-IS (cnr, optional petitioner/respondent,
// court_id/court_name/bench_label/coram/registration_number, latest_order) — envelope is trimmed
// (facets/offset/page_cap/has_more dropped, unused by a hero dropdown), rows are pass-through
// (ship-invariant #1: one contract, no reshaping/renaming — the shape varies enough per `kind`
// that guessing a narrower per-row projection is drift risk for no real payload win).
export const dynamic = "force-dynamic";

const KINDS = new Set(["party", "advocate", "case_number", "order_text"]);
const UPSTREAM_TIMEOUT_MS = 8000;
const LIMIT_MAX = 50;
const LIMIT_DEFAULT = 8; // a hero dropdown wants a handful of suggestions, not a results page
const Q_MAX = 120; // matches the upstream's own max_length

export async function GET(req: NextRequest) {
  const ip = clientIp(req);
  if (!allow(`public-search:${ip}`, 30)) {
    return NextResponse.json({ error: "too many requests" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim().slice(0, Q_MAX);
  if (!q) return NextResponse.json({ error: "q is required" }, { status: 400 });
  const kind = sp.get("kind") ?? "party";
  if (!KINDS.has(kind)) return NextResponse.json({ error: "invalid kind" }, { status: 400 });
  const limit = Math.min(Math.max(1, Number(sp.get("limit")) || LIMIT_DEFAULT), LIMIT_MAX);

  let base: string;
  try {
    base = scraperApiBase();
  } catch (e) {
    console.error("[public-search]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "search temporarily unavailable" }, { status: 500 });
  }

  const upstreamHeaders: Record<string, string> = { accept: "application/json" };
  if (ip !== "unknown") upstreamHeaders["x-forwarded-for"] = ip; // WO-323: credit the real visitor, not the box's shared egress IP

  try {
    const qs = new URLSearchParams({ kind, q, limit: String(limit) });
    const res = await fetch(`${base}/v1/public/search?${qs}`, {
      headers: upstreamHeaders,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.status === 400) {
      const body = await res.json().catch(() => ({ error: "bad request" }));
      return NextResponse.json(body, { status: 400 });
    }
    if (res.status === 429 || res.status === 503) {
      const retryAfter = res.headers.get("retry-after") ?? "30";
      return NextResponse.json(
        { error: "search temporarily unavailable" },
        { status: res.status, headers: { "Retry-After": retryAfter } },
      );
    }
    if (!res.ok) {
      return NextResponse.json({ error: "search temporarily unavailable" }, { status: 502 });
    }
    const data = (await res.json()) as {
      kind?: string; q?: string; count?: number; total?: number; results?: unknown[];
    };
    return NextResponse.json(
      { kind: data.kind ?? kind, q: data.q ?? q, count: data.count ?? 0, total: data.total, results: data.results ?? [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    // Timeout / network failure — a bounded honest 503, never a lying empty result set
    // (ship-invariants #3): a hero dropdown showing "no results" for an upstream outage is worse
    // than an explicit "temporarily unavailable" the client can retry.
    return NextResponse.json({ error: "search temporarily unavailable" }, { status: 503, headers: { "Retry-After": "30" } });
  }
}
