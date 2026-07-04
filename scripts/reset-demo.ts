// WO-08 · Reset the demo tenant to pristine state (< 1 min). seedDemo() already
// clears the tenant's data before re-inserting, so a reset is just a reseed — the
// demo firm/users are preserved, all matters/hearings/invoices/docs/agent data are
// wiped and re-created deterministically.
//
// Run: npx tsx scripts/reset-demo.ts
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { seedDemo } from "./seed-demo";

for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

async function main() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  console.log("Resetting demo tenant to pristine state…");
  await seedDemo(admin);
  console.log("✓ Reset complete.");
}

main().catch((e) => { console.error("reset failed:", e); process.exit(1); });
