// P2 end-to-end smoke. Requires the prod server running on :3000.
// Exercises: advocate add, cause-list cron, refresh->reminder scheduling, notice
// escalation cron, notify cron, and a REAL reminder email to the operator's inbox.
// Run: (npm run build && npm run start &) ; sleep 5 ; npx tsx tests/p2_smoke.ts
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/db/database.types";
import { getMailer } from "../src/lib/notify/mailer"; // self-contained, no @/ deps

for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const CRON = process.env.CRON_SECRET!;
const REAL_INBOX = process.env.REPLY_TO || "yashbahety90@gmail.com";

const cron = (path: string) =>
  fetch(`http://localhost:3000${path}`, { headers: { Authorization: `Bearer ${CRON}` } }).then((r) => r.json());

function yesterday(): string {
  const d = new Date(); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString();
}

async function main() {
  const sb = createClient<Database>(url, anon);
  const { error: e1 } = await sb.auth.signInWithPassword({ email: "demo@lexdriver.test", password: "demo-pass-1234" });
  if (e1) throw new Error("signin: " + e1.message);
  const { data: t } = await sb.from("tenant").select("id").single();
  const tenantId = t!.id;
  console.log("✓ signed in; tenant", tenantId);

  // 1) advocate with bar number
  const { data: adv } = await sb.from("advocate").insert({
    tenant_id: tenantId, name: "Demo Advocate", bar_registration_number: "MAH/1234/1982", state_code: "MH",
  }).select("id").single();
  console.log("✓ advocate added:", adv!.id);

  // 2) matter with a CNR (so refresh cron can schedule reminders)
  const cnr = "MHPU0P2SMOKE00001";
  const { data: matter } = await sb.from("matter").insert({
    tenant_id: tenantId, cnr, title: "P2 Smoke Matter", source: "manual",
  }).select("id").single();
  console.log("✓ matter added:", matter!.id);

  // 3) refresh cron -> upserts via mock, sets next hearing date, schedules reminders
  const refresh = await cron("/api/cron/refresh");
  console.log("✓ refresh cron:", JSON.stringify(refresh));
  const { count: reminders } = await sb.from("notification").select("*", { count: "exact", head: true })
    .eq("kind", "hearing_reminder").contains("payload", { ref: `matter:${matter!.id}` });
  console.log(`✓ hearing reminders scheduled: ${reminders} (expect > 0)`);

  // 4) cause-list cron for the advocate
  const cl = await cron("/api/cron/causelist");
  console.log("✓ causelist cron:", JSON.stringify(cl));
  const { count: entries } = await sb.from("cause_list_entry").select("*", { count: "exact", head: true })
    .eq("advocate_id", adv!.id);
  console.log(`✓ cause_list_entry rows: ${entries} (expect > 0)`);

  // 5) notice that is already overdue -> escalate cron advances it
  const { data: notice } = await sb.from("notice").insert({
    tenant_id: tenantId, matter_id: matter!.id, type: "Legal demand notice",
    sent_at: yesterday(), response_due: yesterday().slice(0, 10),
    escalation_state: "awaiting_response", next_escalation_at: yesterday(),
  }).select("id").single();
  const esc = await cron("/api/cron/escalate");
  console.log("✓ escalate cron:", JSON.stringify(esc));
  const { data: after } = await sb.from("notice").select("escalation_state").eq("id", notice!.id).single();
  console.log(`✓ notice state now: ${after!.escalation_state} (expect escalated_1)`);

  // 6) notify cron processes due notifications (escalation queued one scheduled now)
  const notify = await cron("/api/cron/notify");
  console.log("✓ notify cron:", JSON.stringify(notify));

  // 7) REAL reminder email to the operator's inbox (proves email truly fires)
  const mailer = getMailer();
  const res = await mailer.send(
    REAL_INBOX,
    "Hearing reminder: P2 Smoke Matter (LexDriver test)",
    `<div style="font-family:system-ui"><h2>Hearing reminder</h2><p>This is a real LexDriver P2 test reminder for <b>P2 Smoke Matter</b>.</p><p style="color:#94a3b8;font-size:12px">Not legal advice.</p></div>`,
  );
  console.log(`✓ REAL email -> ${REAL_INBOX}: ok=${res.ok} id=${res.id ?? res.error}`);

  // cleanup
  await sb.from("notification").delete().eq("tenant_id", tenantId).or(`payload->>ref.eq.matter:${matter!.id},payload->>ref.eq.notice:${notice!.id}`);
  await sb.from("cause_list_entry").delete().eq("advocate_id", adv!.id);
  await sb.from("notice").delete().eq("id", notice!.id);
  await sb.from("matter").delete().eq("id", matter!.id);
  await sb.from("advocate").delete().eq("id", adv!.id);
  console.log("✓ cleaned up");

  const pass = (reminders ?? 0) > 0 && (entries ?? 0) > 0 && after!.escalation_state === "escalated_1" && res.ok;
  console.log("\nP2 SMOKE:", pass ? "PASS" : "FAIL");
  if (!pass) process.exit(1);
}
main().catch((e) => { console.error("P2 SMOKE: FAIL\n", e); process.exit(1); });
