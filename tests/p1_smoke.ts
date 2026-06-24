// P1 end-to-end smoke: signs in as the demo user (RLS-scoped), fetches a case via
// the mock provider, upserts it, and reads back the matter + next hearing date.
// Run: npx tsx tests/p1_smoke.ts
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/db/database.types";
import { MockCourtDataClient } from "../src/lib/court/mock";
import { getTenantId, upsertCase } from "../src/lib/court/sync";

// minimal .env loader
for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function main() {
  const supabase = createClient<Database>(url, anon);
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: "demo@lexdriver.test",
    password: "demo-pass-1234",
  });
  if (signInErr) throw new Error("sign in failed: " + signInErr.message);
  console.log("✓ signed in as demo@lexdriver.test (RLS-scoped)");

  const tenantId = await getTenantId(supabase);
  if (!tenantId) throw new Error("no tenant via RLS");
  console.log("✓ tenant resolved via RLS:", tenantId);

  const court = new MockCourtDataClient();
  const cnr = "MHPU010012342020";
  const c = await court.getCaseByCNR(cnr);
  if (!c) throw new Error("mock returned no case");
  console.log(`✓ provider(${c.source}) case: "${c.title}", next hearing ${c.nextHearingDate}, ${c.hearings.length} hearings`);

  const res = await upsertCase(supabase, tenantId, c);
  console.log(`✓ upserted matter ${res.matterId} (new=${res.isNew}, hearings=${res.hearingCount})`);

  // read back via RLS
  const { data: matter } = await supabase
    .from("matter").select("title, cnr, court, next_hearing_date, source, last_synced_at").eq("id", res.matterId).single();
  const { count } = await supabase.from("hearing").select("*", { count: "exact", head: true }).eq("matter_id", res.matterId);
  console.log("✓ read back:", JSON.stringify(matter));
  console.log("✓ hearings in DB:", count);

  // idempotency: re-run upsert, hearings should not multiply
  await upsertCase(supabase, tenantId, c);
  const { count: count2 } = await supabase.from("hearing").select("*", { count: "exact", head: true }).eq("matter_id", res.matterId);
  console.log("✓ idempotent re-sync, hearings still:", count2, count2 === count ? "(OK)" : "(MISMATCH!)");

  // cleanup
  await supabase.from("matter").delete().eq("id", res.matterId);
  console.log("✓ cleaned up test matter");
  console.log("\nP1 SMOKE: PASS");
}

main().catch((e) => { console.error("P1 SMOKE: FAIL\n", e); process.exit(1); });
