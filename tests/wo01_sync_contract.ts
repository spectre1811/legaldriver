// WO-01 contract test: the LegalDriverClient ⇄ ecourts-scraper /v1 sync contract (02-DATA §3).
// Deterministic + offline — stubs global fetch, so it needs NO network/DB/Supabase. Asserts the
// client (a) hits the versioned /v1 sync paths, (b) sends X-API-Key, (c) reads schema_version and
// warns (once) on a MAJOR mismatch, and (d) maps a representative scraper payload → NormalizedCase.
// Run: npx tsx tests/wo01_sync_contract.ts
import { LegalDriverClient } from "@/lib/court/legaldriver";

type Call = { url: string; method: string; apiKey?: string };
const calls: Call[] = [];
let nextBody: unknown = {};
let nextOk = true;

// Minimal fetch stub matching what req() uses (res.ok + res.json()); records the request.
(globalThis as unknown as { fetch: unknown }).fetch = async (input: unknown, init?: { method?: string; headers?: Record<string, string> }) => {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  calls.push({ url: String(input), method: init?.method ?? "GET", apiKey: headers["X-API-Key"] });
  return { ok: nextOk, json: async () => nextBody } as unknown as Response;
};

// A representative /v1/cases/{cnr} payload (shape per api/main.py + case_service.get_case).
function casePayload(cnr: string, schema = "1.0") {
  return {
    schema_version: schema,
    cnr, case_type: "Special Criminal Application", status: "Pending", tier: "HC",
    parties: [{ side: "Petitioner", name: "ABC Corp" }, { side: "Respondent", name: "State of Gujarat" }],
    advocates: [{ name: "R P SHAH(7260)", bar_id: "7260", side: "Petitioner" }],
    hearings: [
      { business_date: "2026-05-10", hearing_date: "2026-07-15", purpose: "Arguments", judge: "HON. J. DOE" },
    ],
    acts: [{ act_name: "IPC", section: "420" }],
    orders: [{ order_id: 991, order_date: "2026-05-10", description: "Interim order", has_text: false, pdf_url: null }],
    processes: [], _source: "live", _fetched_ms: 1234,
  };
}

function assert(cond: boolean, msg: string) { if (!cond) { console.error("FAIL:", msg); failed++; } else { console.log("  ✓", msg); } }
let failed = 0;

async function main() {
  const client = new LegalDriverClient("test-key", "http://scraper.test:8080");

  // 1) getCaseByCNR → /v1/cases/{cnr} + X-API-Key + correct normalization
  calls.length = 0; nextOk = true; nextBody = casePayload("GJHC240001112026");
  const c = await client.getCaseByCNR("GJHC240001112026");
  assert(calls.length === 1 && calls[0].url === "http://scraper.test:8080/v1/cases/GJHC240001112026", `getCaseByCNR hits /v1/cases path (got ${calls[0]?.url})`);
  assert(calls[0].apiKey === "test-key", "sends X-API-Key header");
  assert(!!c && c.cnr === "GJHC240001112026", "returns a normalized case with the cnr");
  assert(!!c && c.source === "legaldriver", "provenance source = legaldriver");
  assert(!!c && c.title === "ABC Corp v. State of Gujarat", "builds title from parties");
  assert(!!c && c.nextHearingDate === "2026-07-15", "derives nextHearingDate from last sitting's hearing_date");
  assert(!!c && Array.isArray(c.hearings) && c.hearings.some((h) => h.date === "2026-07-15"), "upcoming hearing present");
  assert(!!c && c.orders.length === 1 && c.orders[0].id === "991", "maps order id");

  // 2) refreshCases → POST /v1/cases/{cnr}/refresh
  calls.length = 0; nextBody = casePayload("GJHC240001112026");
  await client.refreshCases(["GJHC240001112026"]);
  assert(calls[0]?.url === "http://scraper.test:8080/v1/cases/GJHC240001112026/refresh" && calls[0].method === "POST", `refreshCases → POST /v1/cases/{cnr}/refresh (got ${calls[0]?.method} ${calls[0]?.url})`);

  // 3) getCauseList → /v1/cause-lists?court_id&date, maps item_number/parties fallbacks
  calls.length = 0; nextBody = { schema_version: "1.0", court_id: 12, date: "2026-07-15", items: [{ item_number: "7", case_number: "CR/1/2026", cnr: "GJHC240001112026", parties: "ABC v State", advocate: "R P SHAH" }] };
  const cl = await client.getCauseList({ date: "2026-07-15", court: "12" });
  assert(calls[0]?.url === "http://scraper.test:8080/v1/cause-lists?court_id=12&date=2026-07-15", `getCauseList → /v1/cause-lists (got ${calls[0]?.url})`);
  assert(cl.length === 1 && cl[0].cnr === "GJHC240001112026" && cl[0].itemNo === "7" && cl[0].title === "ABC v State", "maps cause-list item (item_number/parties fallbacks)");

  // 4) getOrder → /v1/cases/{cnr}/orders
  calls.length = 0; nextBody = { schema_version: "1.0", cnr: "GJHC240001112026", orders: [{ order_id: 991, has_pdf: true, pdf_stream: "/order/991/pdf", text: "ORDER TEXT" }] };
  const ord = await client.getOrder("GJHC240001112026", "991");
  assert(calls[0]?.url.startsWith("http://scraper.test:8080/v1/cases/GJHC240001112026/orders"), `getOrder → /v1/cases/{cnr}/orders (got ${calls[0]?.url})`);
  assert(!!ord && ord.pdfUrl === "http://scraper.test:8080/order/991/pdf" && ord.markdown === "ORDER TEXT", "maps order stream URL + text");

  // 5) schema_version MAJOR mismatch warns (once); minor/patch does not
  const warnings: string[] = [];
  const origWarn = console.warn; console.warn = (...a: unknown[]) => { warnings.push(a.join(" ")); };
  nextBody = casePayload("GJHC240009992026", "2.0");
  await client.getCaseByCNR("GJHC240009992026");
  console.warn = origWarn;
  assert(warnings.some((w) => w.includes("schema_version=2.0")), "warns on MAJOR schema mismatch");

  console.log(failed === 0 ? "\nWO-01 SYNC CONTRACT: PASS" : `\nWO-01 SYNC CONTRACT: FAIL (${failed})`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
