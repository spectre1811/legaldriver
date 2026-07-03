// WO-08 · Demo showcase seed. Deterministic + idempotent (clears its own tenant
// data, then re-inserts) so it doubles as a pristine reset. Seeds one firm, two
// advocates, realistic Gujarat matters, hearings (past + upcoming), invoices,
// documents, and a grounded agent thread — a practice that looks real on screen.
//
// ABSOLUTE RULE (WO-08 guardrail): every party/client/judge name here is FICTIONAL.
// Court/case-type shapes are realistic; the ONE live-fetch CNR is chosen at demo
// time (DEMO-SCRIPT). Matters seeded here are source="mock".
//
// Run:   npx tsx scripts/seed-demo.ts
// Reset: npx tsx scripts/reset-demo.ts  (harder wipe, then this)
// Env:   .env (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, optional DEMO_EMAIL)
import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SENIOR_EMAIL = process.env.DEMO_EMAIL ?? "demo@lexdriver.test";
const JUNIOR_EMAIL = process.env.DEMO_EMAIL2 ?? "demo.junior@lexdriver.test";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "peshi-demo-1234";
const FIRM_NAME = "Chambers of Adv. Nirav Desai";

const day = 86_400_000;
const isoDate = (offset: number) => new Date(Date.now() + offset * day).toISOString().slice(0, 10);
const isoTs = (offset: number) => new Date(Date.now() + offset * day).toISOString();

type Admin = SupabaseClient;

async function ensureUser(admin: Admin, email: string): Promise<string> {
  const { data: list } = await admin.auth.admin.listUsers();
  const found = list.users.find((u) => u.email === email);
  if (found) return found.id;
  const { data, error } = await admin.auth.admin.createUser({ email, password: DEMO_PASSWORD, email_confirm: true });
  if (error || !data.user) throw new Error(`create ${email}: ${error?.message}`);
  return data.user.id;
}

// Exported so reset-demo.ts reuses the exact seed after its harder wipe.
export async function seedDemo(admin: Admin): Promise<string> {
  // 1) Firm = the senior advocate's tenant (auto-created by the signup trigger).
  const seniorId = await ensureUser(admin, SENIOR_EMAIL);
  const juniorId = await ensureUser(admin, JUNIOR_EMAIL);
  const { data: sp } = await admin.from("profile").select("tenant_id").eq("id", seniorId).single();
  const tenantId = sp!.tenant_id as string;

  // Move the junior into the firm and clean up their abandoned auto-tenant (the
  // signup trigger makes one per user). Idempotent: on re-run they already point
  // at the firm, so nothing to delete.
  const { data: jp } = await admin.from("profile").select("tenant_id").eq("id", juniorId).single();
  const juniorOldTenant = jp?.tenant_id as string | undefined;
  await admin.from("profile").update({ tenant_id: tenantId, full_name: "Adv. Priya Shah", role: "member" }).eq("id", juniorId);
  if (juniorOldTenant && juniorOldTenant !== tenantId) await admin.from("tenant").delete().eq("id", juniorOldTenant);
  await admin.from("profile").update({ full_name: "Adv. Nirav Desai", role: "owner" }).eq("id", seniorId);
  await admin.from("tenant").update({ name: FIRM_NAME, plan: "pro" }).eq("id", tenantId);
  console.log(`Firm tenant ${tenantId} · ${FIRM_NAME} · 2 advocates`);

  // 2) Clear this tenant's demo data (idempotent → pristine each run; FK-safe order).
  for (const t of ["agent_turn", "invoice_line", "cause_list_entry", "notice", "hearing", "document", "agent_thread", "invoice", "matter", "advocate", "client"]) {
    await admin.from(t).delete().eq("tenant_id", tenantId);
  }

  // 3) Advocates (bar numbers drive the cause-list pull).
  const advs = [
    { name: "Adv. Nirav Desai", bar: "GUJ/1187/2004", state_code: "GJ" },
    { name: "Adv. Priya Shah", bar: "GUJ/3391/2016", state_code: "GJ" },
  ];
  const advIds: string[] = [];
  for (const a of advs) {
    const { data } = await admin.from("advocate").insert({ tenant_id: tenantId, name: a.name, bar_registration_number: a.bar, state_code: a.state_code }).select("id").single();
    advIds.push(data!.id);
  }

  // 4) Clients (fictional).
  const clientDefs = [
    { name: "Sunrise Textiles Pvt Ltd", type: "org", emails: ["accounts@sunrisetextiles.example"] },
    { name: "Kiran Patel", type: "individual", emails: ["kiran.patel@example.com"] },
    { name: "Meghdoot Logistics LLP", type: "org", emails: ["legal@meghdoot.example"] },
    { name: "Anjali Trivedi", type: "individual", emails: ["anjali.t@example.com"] },
    { name: "Rushabh Mehta", type: "individual", emails: ["rushabh.m@example.com"] },
    { name: "Gokul Dairy Co-op", type: "org", emails: ["office@gokuldairy.example"] },
    { name: "Farhan Qureshi", type: "individual", emails: ["farhan.q@example.com"] },
    { name: "Divya Nair", type: "individual", emails: ["divya.nair@example.com"] },
  ];
  const clientIds: Record<string, string> = {};
  for (const c of clientDefs) {
    const { data } = await admin.from("client").insert({ tenant_id: tenantId, name: c.name, type: c.type, emails: c.emails }).select("id").single();
    clientIds[c.name] = data!.id;
  }

  // 5) Matters — realistic Gujarat matters, fictional parties + judges.
  const J = { v: "Hon'ble Shri A. K. Vora", m: "Hon'ble Smt. R. M. Bhatt", p: "Hon'ble Shri D. N. Kapadia" };
  type M = { cnr: string; title: string; court: string; type: string; act: string; stage: string; status: string; next: number; client: string; opp: string; judge: string };
  const matters: M[] = [
    { cnr: "GJHC240012452023", title: "Sunrise Textiles v. Meghdoot Logistics", court: "Gujarat High Court, Ahmedabad", type: "Commercial Appeal", act: "Commercial Courts Act", stage: "Admission", status: "active", next: 4, client: "Sunrise Textiles Pvt Ltd", opp: "Meghdoot Logistics LLP", judge: J.v },
    { cnr: "GJAH010223452024", title: "State v. Kiran Patel", court: "Sessions Court, Ahmedabad", type: "Bail Application", act: "BNSS s.483", stage: "Arguments", status: "active", next: 2, client: "Kiran Patel", opp: "State of Gujarat", judge: J.m },
    { cnr: "GJAH020556782023", title: "Sunrise Textiles v. Ravi Traders", court: "City Civil Court, Ahmedabad", type: "NI Act s.138", act: "NI Act s.138", stage: "Evidence", status: "active", next: 9, client: "Sunrise Textiles Pvt Ltd", opp: "Ravi Traders", judge: J.p },
    { cnr: "GJST010667892022", title: "Anjali Trivedi v. Rakesh Trivedi", court: "Family Court, Surat", type: "Matrimonial", act: "HMA s.13", stage: "Mediation", status: "active", next: 16, client: "Anjali Trivedi", opp: "Rakesh Trivedi", judge: J.m },
    { cnr: "GJRJ030778902023", title: "Rushabh Mehta v. Oriental Insurance", court: "MACT, Rajkot", type: "Motor Accident Claim", act: "MV Act s.166", stage: "Evidence", status: "active", next: 22, client: "Rushabh Mehta", opp: "Oriental Insurance Co.", judge: J.p },
    { cnr: "GJVD040889012021", title: "Gokul Dairy v. Sabar Feeds", court: "Commercial Court, Vadodara", type: "Recovery Suit", act: "CPC O.37", stage: "Written Statement", status: "active", next: 30, client: "Gokul Dairy Co-op", opp: "Sabar Feeds Pvt Ltd", judge: J.v },
    { cnr: "GJHC240990122024", title: "Farhan Qureshi v. State of Gujarat", court: "Gujarat High Court, Ahmedabad", type: "Quashing (BNSS 528)", act: "BNSS s.528", stage: "Notice", status: "active", next: 6, client: "Farhan Qureshi", opp: "State of Gujarat", judge: J.v },
    { cnr: "GJAH011012342023", title: "Divya Nair v. Horizon Realtors", court: "Consumer Forum, Ahmedabad", type: "Consumer Complaint", act: "CP Act 2019", stage: "Arguments", status: "active", next: 12, client: "Divya Nair", opp: "Horizon Realtors LLP", judge: J.m },
    { cnr: "GJAH021123452022", title: "Meghdoot Logistics v. Kandla Port Users", court: "City Civil Court, Ahmedabad", type: "Injunction Suit", act: "SRA s.38", stage: "Interim Relief", status: "active", next: 3, client: "Meghdoot Logistics LLP", opp: "Kandla Port Users Assn.", judge: J.p },
    { cnr: "GJST011234562023", title: "Sunrise Textiles v. State GST", court: "Gujarat High Court, Ahmedabad", type: "Tax Writ", act: "Art. 226", stage: "Admission", status: "active", next: 19, client: "Sunrise Textiles Pvt Ltd", opp: "Commissioner, State GST", judge: J.v },
    { cnr: "GJRJ031345672021", title: "Kiran Patel v. Amaan Shaikh", court: "Civil Court (SD), Rajkot", type: "Cheque Recovery", act: "NI Act s.138", stage: "Judgment", status: "active", next: 8, client: "Kiran Patel", opp: "Amaan Shaikh", judge: J.p },
    { cnr: "GJVD041456782020", title: "Gokul Dairy v. Workmen Union", court: "Labour Court, Vadodara", type: "Industrial Dispute", act: "ID Act s.10", stage: "Evidence", status: "active", next: 27, client: "Gokul Dairy Co-op", opp: "Dairy Workmen Union", judge: J.m },
    { cnr: "GJAH012567892019", title: "Anjali Trivedi v. Sunview AOA", court: "Small Causes Court, Ahmedabad", type: "Tenancy", act: "Rent Act", stage: "Final Arguments", status: "disposed", next: -5, client: "Anjali Trivedi", opp: "Sunview Apartments AOA", judge: J.p },
    { cnr: "GJST011678902024", title: "State v. Farhan Qureshi", court: "Sessions Court, Surat", type: "Criminal Trial", act: "BNS s.318", stage: "Charge", status: "active", next: 5, client: "Farhan Qureshi", opp: "State of Gujarat", judge: J.m },
    { cnr: "GJHC241789012024", title: "Rushabh Mehta v. State (PIL)", court: "Gujarat High Court, Ahmedabad", type: "Writ Petition", act: "Art. 226", stage: "Reply", status: "active", next: 14, client: "Rushabh Mehta", opp: "State of Gujarat", judge: J.v },
  ];

  const matterIds: Record<string, string> = {};
  for (const m of matters) {
    const { data, error } = await admin.from("matter").insert({
      tenant_id: tenantId, client_id: clientIds[m.client], cnr: m.cnr, title: m.title,
      court: m.court, case_type: m.type, stage: m.stage, status: m.status,
      next_hearing_date: m.next >= 0 ? isoDate(m.next) : null,
      last_synced_at: isoTs(-1), source: "mock",
      parties: [{ name: m.client, side: "petitioner" }, { name: m.opp, side: "respondent" }],
      party_names: [m.client, m.opp], judge_names: [m.judge], act_names: [m.act], advocate_names: [advs[0].name],
    }).select("id").single();
    if (error) throw new Error(`matter ${m.cnr}: ${error.message}`);
    matterIds[m.cnr] = data!.id;

    const hearings = [
      { tenant_id: tenantId, matter_id: data!.id, date: isoDate(-45), purpose: "Framing of Issues", court_no: "5", judge: m.judge },
      { tenant_id: tenantId, matter_id: data!.id, date: isoDate(-18), purpose: "Evidence", court_no: "5", judge: m.judge },
    ];
    if (m.next >= 0) hearings.push({ tenant_id: tenantId, matter_id: data!.id, date: isoDate(m.next), purpose: m.stage, court_no: "5", judge: m.judge });
    await admin.from("hearing").insert(hearings);
  }
  console.log(`Matters: ${matters.length} (with hearings)`);

  // 6) Invoices (intra-state Gujarat, CGST+SGST 9%+9%). Amounts in paise.
  const invDefs = [
    { client: "Sunrise Textiles Pvt Ltd", cnr: "GJAH020556782023", status: "paid", num: "PESHI/2026-27/001", lines: [["Professional fees — s.138 complaint drafting & appearance", 4500000], ["Court fees & misc. disbursements", 350000]] as [string, number][] },
    { client: "Gokul Dairy Co-op", cnr: "GJVD040889012021", status: "sent", num: "PESHI/2026-27/002", lines: [["Retainer — recovery suit (O.37 CPC)", 6000000]] as [string, number][] },
    { client: "Rushabh Mehta", cnr: "GJRJ030778902023", status: "draft", num: null, lines: [["Appearance fees — MACT evidence (3 hearings)", 2250000], ["Clerkage", 150000]] as [string, number][] },
  ];
  for (const inv of invDefs) {
    const subtotal = inv.lines.reduce((s, [, amt]) => s + amt, 0);
    const cgst = Math.round(subtotal * 0.09);
    const { data: row, error } = await admin.from("invoice").insert({
      tenant_id: tenantId, client_id: clientIds[inv.client], matter_id: matterIds[inv.cnr],
      number: inv.num, fy: "2026-27", issue_date: isoDate(-7), due_date: isoDate(23),
      status: inv.status, place_of_supply: "24", reverse_charge: false, gst_rate: 18,
      subtotal_minor: subtotal, cgst_minor: cgst, sgst_minor: cgst, igst_minor: 0,
      total_minor: subtotal + cgst + cgst, notes: "Legal services — SAC 9982.",
    }).select("id").single();
    if (error) throw new Error(`invoice ${inv.client}: ${error.message}`);
    await admin.from("invoice_line").insert(inv.lines.map(([desc, amt], i) => ({
      tenant_id: tenantId, invoice_id: row!.id, kind: "fee", description: desc,
      hsn_sac: "9982", quantity: 1, unit: "item", rate_minor: amt, amount_minor: amt, sort: i,
    })));
  }
  console.log(`Invoices: ${invDefs.length} (with GST lines)`);

  // 7) Documents (fictional, no PII).
  const docDefs = [
    { cnr: "GJAH020556782023", client: "Sunrise Textiles Pvt Ltd", filename: "s138-demand-notice.pdf", doc_type: "notice", text: "Statutory demand notice under s.138 NI Act for dishonoured cheque no. 004521 dated 12-03-2026, amount Rs. 4,50,000, drawn on a Rajkot branch." },
    { cnr: "GJRJ030778902023", client: "Rushabh Mehta", filename: "mact-claim-petition.pdf", doc_type: "petition", text: "Claim petition under s.166 MV Act arising from a road accident on NH-27; claimant sustained a fractured tibia and lost 45 days of income." },
    { cnr: "GJHC240012452023", client: "Sunrise Textiles Pvt Ltd", filename: "memo-of-appeal.pdf", doc_type: "appeal", text: "Memorandum of Commercial Appeal against the judgment of the Commercial Court, challenging the finding on limitation." },
    { cnr: "GJAH010223452024", client: "Kiran Patel", filename: "bail-application.pdf", doc_type: "application", text: "Regular bail application under s.483 BNSS; the applicant has clean antecedents and deep local roots in Ahmedabad." },
    { cnr: "GJAH011012342023", client: "Divya Nair", filename: "consumer-complaint.pdf", doc_type: "complaint", text: "Consumer complaint under the CP Act 2019 for deficiency in service — delayed possession of a residential flat by 26 months." },
  ];
  for (const d of docDefs) {
    await admin.from("document").insert({
      tenant_id: tenantId, source: "upload", filename: d.filename, mime: "application/pdf",
      parsed_text: d.text, doc_type: d.doc_type, matter_id: matterIds[d.cnr], client_id: clientIds[d.client],
      size_bytes: 120000 + d.text.length, content_hash: `demo-${d.filename}`,
    });
  }
  console.log(`Documents: ${docDefs.length}`);

  // 8) Agent thread — a grounded Q&A with citations + the mandatory disclaimer.
  const { data: thread, error: thErr } = await admin.from("agent_thread").insert({
    tenant_id: tenantId, user_id: seniorId, matter_id: matterIds["GJAH020556782023"], title: "s.138 limitation & next steps",
  }).select("id").single();
  if (thErr || !thread) throw new Error(`agent_thread: ${thErr?.message}`);
  // NOTE: PostgREST bulk insert requires every row to share the SAME keys, so both
  // turns carry citations + meta (user turn: empty).
  const { error: turnErr } = await admin.from("agent_turn").insert([
    { thread_id: thread.id, tenant_id: tenantId, role: "user", content: "For the Sunrise Textiles cheque-bounce matter, what is the limitation for filing the s.138 complaint and what's the next step?", citations: [], meta: {} },
    {
      thread_id: thread.id, tenant_id: tenantId, role: "assistant",
      content: "Under s.138 NI Act, the complaint must be filed within 1 month of the cause of action — i.e. 30 days after the 15-day statutory notice period expires without payment [1]. The demand notice is on record [2], so the next step is to confirm the notice-served date and calendar the 15+30 day windows. The matter is listed for evidence.\n\nNot legal advice — verify against the official record and the bare Act.",
      citations: [
        { n: 1, source: "legal_reference", ref: "NI Act s.138 proviso (b),(c)", title: "Negotiable Instruments Act, 1881 - s.138" },
        { n: 2, source: "document", ref: "s138-demand-notice.pdf", title: "Statutory demand notice" },
      ],
      meta: { abstained: false },
    },
  ]);
  if (turnErr) throw new Error(`agent_turn: ${turnErr.message}`);
  console.log("Agent thread: 1 (grounded, cited)");

  // 9) Cause-list entry (next listed matter) + a notice mid-escalation.
  const clMatter = matters.find((m) => m.next >= 0)!;
  await admin.from("cause_list_entry").insert({
    tenant_id: tenantId, advocate_id: advIds[0], list_date: isoDate(clMatter.next),
    court: clMatter.court, item_no: "12", cnr: clMatter.cnr, matter_id: matterIds[clMatter.cnr],
  });
  await admin.from("notice").insert({
    tenant_id: tenantId, matter_id: matterIds["GJAH020556782023"], type: "Legal demand notice",
    sent_at: isoTs(-10), response_due: isoDate(-3), escalation_state: "awaiting_response", next_escalation_at: isoTs(-3),
  });

  console.log(`\n✓ Demo tenant seeded: ${FIRM_NAME} · 2 advocates · ${clientDefs.length} clients · ${matters.length} matters · ${invDefs.length} invoices · ${docDefs.length} docs · 1 agent thread.`);
  console.log(`  Sign in: ${SENIOR_EMAIL} (password = $DEMO_PASSWORD)`);
  return tenantId;
}

async function main() {
  const admin = createClient(url, svc, { auth: { persistSession: false } });
  await seedDemo(admin);
}

// Only auto-run when invoked directly (reset-demo.ts imports seedDemo).
if (process.argv[1] && process.argv[1].endsWith("seed-demo.ts")) {
  main().catch((e) => { console.error("seed failed:", e); process.exit(1); });
}
