// WO-289 · Two-sided contract test for `POST /v1/cause-lists/fetch` — pins the CLIENT request
// shape against the ecourts-scraper API SIGNATURE, so the body-vs-query 422 (the console's
// on-demand cause-list lane was dead on arrival the day LD_ONDEMAND_CAUSELIST flips) can't recur.
// Deterministic + offline — stubs global fetch, so it needs NO network/DB/Supabase.
// Run: npx tsx tests/wo289_causelist_fetch_contract.ts
import { LegalDriverClient } from "@/lib/court/legaldriver";

// ── The API side of the contract (pinned reference — verify against the live signature before
// changing this test) ────────────────────────────────────────────────────────────────────────
// ecourts-scraper `api/main.py`:
//   @app.post("/v1/cause-lists/fetch")
//   def v1_cause_list_fetch(request: Request, court_id: int = Query(...),
//                           date: str = Query(..., description="YYYY-MM-DD"),
//                           x_api_key: Optional[str] = Header(default=None)):
// `court_id` and `date` are FastAPI `Query(...)` params — they arrive on the URL query string,
// NEVER parsed from a request body. There is no Pydantic body model on this route at all: any
// client that POSTs a JSON body instead gets a 422 "field required" for both params (this is
// exactly the bug WO-289 fixes — legaldriver.ts:304-309 used to send `body: JSON.stringify(...)`).
const API_SIGNATURE = {
  method: "POST",
  path: "/v1/cause-lists/fetch",
  queryParams: ["court_id", "date"] as const, // int, str — Query(...), NOT a body field
  authHeader: "X-API-Key",
} as const;

let failed = 0;
function assert(cond: boolean, msg: string) { if (!cond) { console.error("FAIL:", msg); failed++; } else { console.log("  ✓", msg); } }

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
let lastCall: Call | null = null;

(globalThis as unknown as { fetch: unknown }).fetch = async (
  input: unknown,
  init?: { method?: string; headers?: Record<string, string>; body?: unknown },
) => {
  lastCall = {
    url: String(input),
    method: init?.method ?? "GET",
    headers: (init?.headers ?? {}) as Record<string, string>,
    body: init?.body,
  };
  return { ok: true, status: 200, json: async () => ({ items: [{ cnr: "GJHC240001112026" }] }) } as unknown as Response;
};

async function main() {
  const client = new LegalDriverClient("test-key", "http://scraper.test:8080");

  // 1) The client-side shape: query params, no body, right method + auth header.
  await client.requestCauseListFetch("12", "2026-07-15");
  const url = new URL(lastCall!.url);
  assert(lastCall!.method === API_SIGNATURE.method, `sends ${API_SIGNATURE.method} (got ${lastCall!.method})`);
  assert(url.pathname === API_SIGNATURE.path, `hits ${API_SIGNATURE.path} (got ${url.pathname})`);
  for (const p of API_SIGNATURE.queryParams) {
    assert(url.searchParams.has(p), `query string carries '${p}' (${url.searchParams.toString()})`);
  }
  assert(url.searchParams.get("court_id") === "12", "court_id travels as a query value, not a body field");
  assert(url.searchParams.get("date") === "2026-07-15", "date travels as a query value");
  assert(lastCall!.body === undefined, "NO request body is sent (the API has no body model on this route)");
  assert(lastCall!.headers[API_SIGNATURE.authHeader] === "test-key", `sends ${API_SIGNATURE.authHeader}`);

  // 2) court_id INT coercion: a numeric-looking string round-trips as the same integer on the wire
  // (query values are always strings on HTTP — this asserts OUR client-side guard, not FastAPI's).
  lastCall = null;
  await client.requestCauseListFetch("0007", "2026-07-15");
  assert(new URL(lastCall!.url).searchParams.get("court_id") === "7", "court_id is coerced through Number() (leading zeros/whitespace can't leak through)");

  // 3) A non-numeric court_id never reaches the network at all (honest client-side guard, not a
  // wasted round trip that would 422 anyway).
  lastCall = null;
  const badResult = await client.requestCauseListFetch("not-a-court", "2026-07-15");
  assert(lastCall === null, "a non-numeric court_id makes NO network call");
  assert(badResult.status === 0 && badResult.hasItems === false, "non-numeric court_id → the same honest transient-error shape as a network failure");

  console.log(failed === 0 ? "\nWO-289 CAUSELIST-FETCH CONTRACT: PASS" : `\nWO-289 CAUSELIST-FETCH CONTRACT: FAIL (${failed})`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
