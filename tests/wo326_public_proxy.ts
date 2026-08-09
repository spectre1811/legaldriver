// WO-326 · Public search + stats proxy (mukadma.in apex → ecourts-scraper /v1/public/*).
// Offline: no network, no secrets. Stubs global fetch so the REAL route handlers run end to end —
// the only honest way to assert the envelope trim, error mapping, and rate limit actually fire.
// Run: npx tsx tests/wo326_public_proxy.ts
import { NextRequest } from "next/server";

let failed = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`ok  : ${label}`);
  else { failed++; console.error(`FAIL: ${label}${extra === undefined ? "" : ` — ${JSON.stringify(extra)}`}`); }
}

type FetchCall = { url: string; headers: Record<string, string> };
const fetchCalls: FetchCall[] = [];
let mode: "ok" | "throw" | "upstream400" | "upstream429" | "upstream503" = "ok";
let upstreamBody: unknown = {};

(globalThis as unknown as { fetch: unknown }).fetch = async (input: unknown, init?: { headers?: Record<string, string> }) => {
  const url = String(input);
  fetchCalls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
  if (mode === "throw") throw new Error("network down");
  if (mode === "upstream400") return { ok: false, status: 400, headers: new Headers(), json: async () => ({ detail: "unknown public search kind: bogus" }) } as unknown as Response;
  if (mode === "upstream429") return { ok: false, status: 429, headers: new Headers({ "retry-after": "45" }), json: async () => ({}) } as unknown as Response;
  if (mode === "upstream503") return { ok: false, status: 503, headers: new Headers({ "retry-after": "60" }), json: async () => ({}) } as unknown as Response;
  return { ok: true, status: 200, headers: new Headers(), json: async () => upstreamBody } as unknown as Response;
};

const req = (path: string, ip: string) => new NextRequest(`https://mukadma.in${path}`, { headers: { "cf-connecting-ip": ip } });

async function main() {
  // Config MUST be unset for this first check — routes read it at request time, not module load.
  delete process.env.SCRAPER_API_BASE;
  const { GET: searchGET } = await import("@/app/api/public/search/route");
  const { GET: statsGET } = await import("@/app/api/public/stats/route");

  // 1) fail-closed: unset base → 500, never a silent fallback/empty-ok.
  let res = await searchGET(req("/api/public/search?q=sharma", "1.1.1.1"));
  check("search: unset SCRAPER_API_BASE → 500", res.status === 500);
  res = await statsGET(req("/api/public/stats", "1.1.1.2"));
  check("stats: unset SCRAPER_API_BASE → 500", res.status === 500);

  process.env.SCRAPER_API_BASE = "https://scraper.test/";

  // 2) input caps
  res = await searchGET(req("/api/public/search", "2.2.2.1"));
  check("search: missing q → 400", res.status === 400);
  res = await searchGET(req("/api/public/search?q=sharma&kind=bogus", "2.2.2.2"));
  check("search: invalid kind → 400", res.status === 400);

  // 3) happy path: envelope trimmed, rows pass through untouched, real IP forwarded, no base leak
  fetchCalls.length = 0;
  mode = "ok";
  upstreamBody = {
    schema_version: "1.0", kind: "party", q: "sharma", count: 1, results: [
      { cnr: "GJHC01", petitioner: "A Sharma", respondent: "State", latest_order: { order_id: 1, order_date: "2026-01-01", description: "Interim" } },
    ],
    total: 1, total_capped: false, offset: 0, page_cap: 500, has_more: false,
    facets: { tier: { HIGH: 1 } },
  };
  res = await searchGET(req("/api/public/search?q=sharma", "3.3.3.3"));
  let body = await res.json() as Record<string, unknown>;
  check("search: 200 on a clean upstream hit", res.status === 200, res.status);
  check("search: envelope trimmed to kind/q/count/total/results only", Object.keys(body).sort().join(",") === "count,kind,q,results,total");
  check("search: row passed through unmodified (petitioner/respondent/latest_order intact)",
    JSON.stringify((body.results as unknown[])[0]) === JSON.stringify((upstreamBody as { results: unknown[] }).results[0]));
  check("search: default kind=party when omitted", fetchCalls[0].url.includes("kind=party"));
  check("search: real client IP forwarded as x-forwarded-for (not the box's own)", fetchCalls[0].headers["x-forwarded-for"] === "3.3.3.3");
  check("search: response never carries the upstream base URL (no leak)", !JSON.stringify(body).includes("scraper.test"));
  check("search: Cache-Control is no-store (this is a live query, not a cacheable record)", res.headers.get("cache-control") === "no-store");

  // 4) limit clamps
  fetchCalls.length = 0;
  await searchGET(req("/api/public/search?q=x&limit=999", "3.3.3.4"));
  check("search: limit clamped to the upstream max (50)", fetchCalls.at(-1)!.url.includes("limit=50"));
  await searchGET(req("/api/public/search?q=x&limit=-5", "3.3.3.5"));
  check("search: limit floors to 1", fetchCalls.at(-1)!.url.includes("limit=1&") || fetchCalls.at(-1)!.url.endsWith("limit=1"));

  // 5) upstream error mapping — honest, bounded, never a lying empty 200
  mode = "upstream400";
  res = await searchGET(req("/api/public/search?q=sharma", "4.4.4.1"));
  body = await res.json() as Record<string, unknown>;
  check("search: upstream 400 passes through", res.status === 400 && body.detail === "unknown public search kind: bogus");

  mode = "upstream429";
  res = await searchGET(req("/api/public/search?q=sharma", "4.4.4.2"));
  check("search: upstream 429 passes through with its Retry-After", res.status === 429 && res.headers.get("retry-after") === "45");

  mode = "upstream503";
  res = await searchGET(req("/api/public/search?q=sharma", "4.4.4.3"));
  check("search: upstream 503 passes through with its Retry-After", res.status === 503 && res.headers.get("retry-after") === "60");

  mode = "throw";
  res = await searchGET(req("/api/public/search?q=sharma", "4.4.4.4"));
  check("search: network/timeout failure → bounded 503, never an empty 200", res.status === 503 && res.headers.get("retry-after") === "30");
  body = await res.json() as Record<string, unknown>;
  check("search: a failed upstream never returns a lying empty results:[]", !("results" in body));

  // 6) rate limit — flood one IP past the cap; the limiter must trip BEFORE any upstream call
  mode = "ok";
  upstreamBody = { kind: "party", q: "x", count: 0, results: [] };
  const floodIp = "5.5.5.5";
  let calls429 = 0;
  const before = fetchCalls.length;
  for (let i = 0; i < 35; i++) {
    const r = await searchGET(req("/api/public/search?q=x", floodIp));
    if (r.status === 429) { calls429++; if (calls429 === 1) check("search: flood trips 429 with Retry-After", r.headers.get("retry-after") === "60"); }
  }
  check("search: flood (35 req/60s from one IP) trips 429 at least once", calls429 > 0, calls429);
  check("search: a tripped limiter never reaches the upstream past its cap", fetchCalls.length - before <= 30, fetchCalls.length - before);

  // 7) stats: pass-through + its own cache header, own rate limit
  mode = "ok";
  upstreamBody = { schema_version: "1.0", cases_indexed: 55_123_456, courts: 900, states: 4, updated_at: "2026-08-09T00:00:00Z" };
  res = await statsGET(req("/api/public/stats", "6.6.6.1"));
  body = await res.json() as Record<string, unknown>;
  check("stats: 200 pass-through of the upstream body", res.status === 200 && body.cases_indexed === 55_123_456);
  check("stats: Cache-Control set to the 1h revalidate window", res.headers.get("cache-control") === "public, max-age=3600");
  check("stats: response never carries the upstream base URL (no leak)", !JSON.stringify(body).includes("scraper.test"));

  const statsFloodIp = "7.7.7.7";
  let stats429 = 0;
  for (let i = 0; i < 65; i++) {
    const r = await statsGET(req("/api/public/stats", statsFloodIp));
    if (r.status === 429) stats429++;
  }
  check("stats: flood (65 req/60s from one IP) trips 429", stats429 > 0, stats429);

  console.log(failed === 0 ? "\nWO-326 PUBLIC PROXY: PASS" : `\nWO-326 PUBLIC PROXY: FAIL (${failed})`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
