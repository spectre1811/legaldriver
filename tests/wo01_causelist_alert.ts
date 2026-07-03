// WO-01 daily cause-list alert — LegalDriverClient.getCauseListByCNRs ⇄ /v1/cause-lists/by-cnr.
// Deterministic + offline (stubs global fetch). Run: npx tsx tests/wo01_causelist_alert.ts
import { LegalDriverClient } from "@/lib/court/legaldriver";

type Call = { url: string; apiKey?: string };
const calls: Call[] = [];
let body: unknown = {};
(globalThis as unknown as { fetch: unknown }).fetch = async (input: unknown, init?: { headers?: Record<string, string> }) => {
  calls.push({ url: String(input), apiKey: (init?.headers ?? {})["X-API-Key"] });
  return { ok: true, json: async () => body } as unknown as Response;
};

let failed = 0;
const ok = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); failed++; } else console.log("  ✓", m); };

async function main() {
  const client = new LegalDriverClient("k", "http://scraper.test:8080");

  // 1) hits /v1/cause-lists/by-cnr with date + a cnr= per CNR (deduped + uppercased), sends key
  calls.length = 0;
  body = { schema_version: "1.0", date: "2026-07-06", requested: 2, listed: 1, items: [
    { cnr: "GJHC240001112026", item_number: 7, case_number: "SCA/9/2026", cause_list_type: "civil",
      parties: "ABC &amp; Co versus State", advocate: "R P SHAH", judge: "HON. J. DOE", court_id: 3716, list_date: "2026-07-06" },
  ] };
  const hits = await client.getCauseListByCNRs(["gjhc240001112026", "GJHC240001112026", "GJHC240009992026"], "2026-07-06");
  ok(calls.length === 1, "one batched request for ≤100 CNRs");
  ok(calls[0].url.startsWith("http://scraper.test:8080/v1/cause-lists/by-cnr?date=2026-07-06&"), `by-cnr path + date (got ${calls[0].url})`);
  ok(calls[0].apiKey === "k", "sends X-API-Key");
  const params = new URLSearchParams(calls[0].url.split("?")[1]);
  const cnrParams = params.getAll("cnr");
  ok(cnrParams.length === 2 && cnrParams.includes("GJHC240001112026") && cnrParams.includes("GJHC240009992026"), `deduped+uppercased CNRs (got ${cnrParams.join(",")})`);

  ok(hits.length === 1, "returns the listed hit");
  const h = hits[0];
  ok(h.cnr === "GJHC240001112026" && h.itemNo === "7" && h.type === "civil", "maps cnr/item/type");
  ok(h.judge === "HON. J. DOE" && h.courtId === 3716, "maps judge + courtId");
  ok(h.parties === "ABC & Co versus State", `decodes HTML entities in parties (got ${h.parties})`);

  // 2) empty input → no request, empty result
  calls.length = 0;
  ok((await client.getCauseListByCNRs([], "2026-07-06")).length === 0 && calls.length === 0, "empty CNR list → no fetch");

  // 3) >100 CNRs → batched into multiple requests
  calls.length = 0; body = { items: [] };
  const many = Array.from({ length: 250 }, (_, i) => `GJHC2400${String(i).padStart(6, "0")}2026`);
  await client.getCauseListByCNRs(many, "2026-07-06");
  ok(calls.length === 3, `250 CNRs → 3 batches of ≤100 (got ${calls.length})`);

  console.log(failed === 0 ? "\nWO-01 CAUSELIST ALERT: PASS" : `\nWO-01 CAUSELIST ALERT: FAIL (${failed})`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
