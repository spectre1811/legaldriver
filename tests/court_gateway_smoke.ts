// Smoke test: Court Data Gateway read-through cache (E7-v1).
// Run: set -a; source .env; set +a; npx tsx tests/court_gateway_smoke.ts
import { getCaseCached, getProviderHealth } from "@/lib/court/gateway";
import { createAdminClient } from "@/lib/supabase/admin";

async function main() {
  const cnr = "SMOKEGATEWAY000001";
  const admin = createAdminClient();
  await admin.from("court_cache").delete().eq("cache_key", cnr); // clean slate

  const miss = await getCaseCached(cnr);
  console.log(`1) first fetch  -> cacheHit=${miss.cacheHit} stale=${miss.stale} source=${miss.source} title=${miss.case?.title ?? "—"}`);

  const hit = await getCaseCached(cnr);
  console.log(`2) second fetch -> cacheHit=${hit.cacheHit} stale=${hit.stale} (expect cacheHit=true)`);

  const forced = await getCaseCached(cnr, { force: true });
  console.log(`3) forced fetch -> cacheHit=${forced.cacheHit} (expect false)`);

  const { count } = await admin.from("court_cache").select("*", { count: "exact", head: true }).eq("cache_key", cnr);
  console.log(`4) court_cache rows for key: ${count}`);

  const health = await getProviderHealth();
  console.log(`5) provider health: ${JSON.stringify(health.map((h) => ({ p: h.provider, ok: h.ok })))}`);

  const pass = !miss.cacheHit && hit.cacheHit && !forced.cacheHit && (count ?? 0) >= 1 && !!miss.case;
  console.log(pass ? "\nGATEWAY SMOKE: PASS" : "\nGATEWAY SMOKE: FAIL");
  await admin.from("court_cache").delete().eq("cache_key", cnr); // cleanup
  process.exit(pass ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
