// WO-08 · Pre-recording readiness check. Run right before capturing the demo
// video: asserts the demo tenant has every golden-path ingredient on screen and
// carries no real-entity PII. Exits non-zero if the demo isn't camera-ready, so
// it's a real gate — not just a print.
//
// Run: npx tsx scripts/verify-demo.ts   (after seed-demo / reset-demo)
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const FIRM_NAME = "Chambers of Adv. Nirav Desai";

let fail = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "✓" : "✗"} ${label} — ${detail}`);
  if (!ok) fail += 1;
}

async function main() {
  const { data: tenant } = await admin.from("tenant").select("id, plan").eq("name", FIRM_NAME).maybeSingle();
  if (!tenant) { console.error(`✗ demo tenant "${FIRM_NAME}" not found — run: npx tsx scripts/reset-demo.ts`); process.exit(1); }
  const t = tenant.id;
  const today = new Date().toISOString().slice(0, 10);
  const count = async (table: string, mod?: (q: any) => any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    let q = admin.from(table).select("*", { count: "exact", head: true }).eq("tenant_id", t);
    if (mod) q = mod(q);
    const { count: n } = await q;
    return n ?? 0;
  };

  check("plan is Pro", tenant.plan === "pro", `plan=${tenant.plan}`);
  check("advocates seeded", (await count("advocate")) >= 2, `${await count("advocate")} advocates`);
  const matters = await count("matter");
  check("matters (Today/cases populated)", matters >= 15, `${matters} matters`);
  const upcoming = await count("hearing", (q: any) => q.gte("date", today)); // eslint-disable-line @typescript-eslint/no-explicit-any
  check("upcoming hearings (Today view)", upcoming >= 1, `${upcoming} on/after ${today}`);
  check("invoices present", (await count("invoice")) >= 3, `${await count("invoice")} invoices`);
  check("cause-list entry (drill-down)", (await count("cause_list_entry")) >= 1, `${await count("cause_list_entry")} entries`);
  check("documents present", (await count("document")) >= 3, `${await count("document")} docs`);

  // Agent thread must have a CITED assistant turn (investors screenshot citations).
  const { data: cited } = await admin.from("agent_turn").select("citations").eq("tenant_id", t).eq("role", "assistant");
  const hasCite = (cited ?? []).some((r) => Array.isArray(r.citations) && r.citations.length > 0);
  check("agent thread has a cited answer", hasCite, `${cited?.length ?? 0} assistant turns`);

  // Fictional-parties guard — no well-known real entities on any recorded screen.
  const { data: parties } = await admin.from("matter").select("party_names").eq("tenant_id", t);
  const blob = JSON.stringify(parties ?? []).toLowerCase();
  const banned = ["reliance", "tata", "adani", "ambani", "infosys", "wipro"];
  const hit = banned.find((b) => blob.includes(b));
  check("fictional parties only (no real-entity PII)", !hit, hit ? `FOUND "${hit}"` : "clean");

  console.log(fail === 0 ? "\n✅ DEMO READY — safe to record." : `\n❌ ${fail} check(s) failed — fix before recording.`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error("verify failed:", e); process.exit(1); });
