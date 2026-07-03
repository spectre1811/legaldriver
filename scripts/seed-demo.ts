// Seed demo data so the live URL is non-empty. Idempotent — safe to re-run.
// Seeds the demo user's tenant with an advocate (bar number), clients, matters
// (with upcoming hearings), a cause-list entry, and a notice mid-escalation.
//
// Run:  npx tsx scripts/seed-demo.ts
// Env:  reads .env (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "demo@mukadma.in";

function isoIn(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const admin = createClient(url, svc, { auth: { persistSession: false } });

  // Resolve the demo user's tenant.
  const { data: list } = await admin.auth.admin.listUsers();
  const demo = list.users.find((u) => u.email === DEMO_EMAIL);
  if (!demo) throw new Error(`Demo user ${DEMO_EMAIL} not found — create it first.`);
  const { data: profile } = await admin.from("profile").select("tenant_id").eq("id", demo.id).single();
  const tenantId = profile!.tenant_id;
  console.log("Seeding tenant", tenantId);

  // Advocate (bar number drives the cause-list pull). Find-or-create by bar number.
  const bar = "MAH/1234/1982";
  let advId: string;
  const advFound = await admin.from("advocate").select("id").eq("tenant_id", tenantId).eq("bar_registration_number", bar).maybeSingle();
  if (advFound.data) {
    advId = advFound.data.id;
  } else {
    const { data } = await admin
      .from("advocate")
      .insert({ tenant_id: tenantId, name: "Adv. Meera Joshi", bar_registration_number: bar, state_code: "MH" })
      .select("id")
      .single();
    advId = data!.id;
  }

  // Clients.
  const clients = [
    { name: "Acme Corp", type: "org", emails: ["accounts@acmecorp.example"] },
    { name: "Rajesh Sharma", type: "individual", emails: ["rajesh@example.com"] },
  ];
  const clientIds: Record<string, string> = {};
  for (const c of clients) {
    const existing = await admin.from("client").select("id").eq("tenant_id", tenantId).eq("name", c.name).maybeSingle();
    if (existing.data) { clientIds[c.name] = existing.data.id; continue; }
    const { data } = await admin.from("client").insert({ tenant_id: tenantId, ...c }).select("id").single();
    clientIds[c.name] = data!.id;
  }

  // Matters with upcoming hearings.
  const matters = [
    { cnr: "MHPU010012342022", title: "Sharma v. Patel (7975/2022)", court: "District Court, Pune", client: "Rajesh Sharma", next: isoIn(6), stage: "Evidence" },
    { cnr: "MHCC020056782021", title: "Acme Corp v. Vendor Ltd (5678/2021)", court: "City Civil Court, Mumbai", client: "Acme Corp", next: isoIn(13), stage: "Arguments" },
  ];
  for (const m of matters) {
    const existing = await admin.from("matter").select("id").eq("tenant_id", tenantId).eq("cnr", m.cnr).maybeSingle();
    let matterId = existing.data?.id;
    if (!matterId) {
      const { data } = await admin.from("matter").insert({
        tenant_id: tenantId, client_id: clientIds[m.client], cnr: m.cnr, title: m.title,
        court: m.court, case_type: "Civil Suit", stage: m.stage, status: "active",
        next_hearing_date: m.next, last_synced_at: new Date().toISOString(), source: "mock",
        parties: [{ name: m.client, side: "petitioner" }, { name: "Opposite Party", side: "respondent" }],
      }).select("id").single();
      matterId = data!.id;
    }
    // hearings: a couple past + the upcoming one.
    await admin.from("hearing").delete().eq("matter_id", matterId);
    await admin.from("hearing").insert([
      { tenant_id: tenantId, matter_id: matterId, date: isoIn(-28), purpose: "Framing of Issues", court_no: "3", judge: "Hon'ble Smt. R. Desai" },
      { tenant_id: tenantId, matter_id: matterId, date: m.next, purpose: m.stage, court_no: "3", judge: "Hon'ble Smt. R. Desai" },
    ]);
  }

  // A cause-list entry for the advocate, linked to the first matter.
  {
    const firstMatter = await admin.from("matter").select("id").eq("tenant_id", tenantId).eq("cnr", matters[0].cnr).single();
    const { error } = await admin.from("cause_list_entry").upsert(
      { tenant_id: tenantId, advocate_id: advId, list_date: matters[0].next, court: matters[0].court, item_no: "12", cnr: matters[0].cnr, matter_id: firstMatter.data!.id },
      { onConflict: "tenant_id,advocate_id,list_date,item_no" },
    );
    if (error) console.warn("cause-list seed warning:", error.message);
  }

  // A notice mid-escalation (overdue → escalation cron will advance it).
  const firstMatter = await admin.from("matter").select("id").eq("tenant_id", tenantId).eq("cnr", matters[1].cnr).single();
  const existsNotice = await admin.from("notice").select("id").eq("tenant_id", tenantId).eq("type", "Legal demand notice").maybeSingle();
  if (!existsNotice.data) {
    await admin.from("notice").insert({
      tenant_id: tenantId, matter_id: firstMatter.data!.id, type: "Legal demand notice",
      sent_at: new Date(Date.now() - 10 * 86400000).toISOString(), response_due: isoIn(-3),
      escalation_state: "awaiting_response", next_escalation_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    });
  }

  console.log("✓ Seeded: 1 advocate, 2 clients, 2 matters (with hearings), 1 cause-list entry, 1 notice.");
}

main().catch((e) => { console.error("seed failed:", e); process.exit(1); });
