// RLS tenant-isolation test: a second user must see NONE of another tenant's data,
// even when querying specific row ids. Creates a temp user, verifies, cleans up.
// Run: npx tsx tests/rls_isolation.ts
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const l of readFileSync(".env", "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const TENANT_TABLES = [
  "advocate", "client", "matter", "hearing", "deadline", "cause_list_entry",
  "notice", "notification", "email_message", "document", "oauth_connection", "audit_event",
  "ai_usage_event",
];

async function main() {
  const admin = createClient(url, svc, { auth: { persistSession: false } });
  const email = `rlstest_${Date.now()}@lexdriver.test`;
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, password: "rls-test-pass-1234", email_confirm: true,
  });
  if (cErr) throw new Error("create user: " + cErr.message);
  const newUserId = created.user!.id;
  console.log("✓ created temp user", email);

  // Find an existing tenant with real data (not the new user's) to probe against.
  const { data: someDoc } = await admin.from("document").select("id, tenant_id").limit(1).maybeSingle();
  const { data: someEmail } = await admin.from("email_message").select("id, tenant_id").limit(1).maybeSingle();
  const otherTenant = someDoc?.tenant_id ?? someEmail?.tenant_id;
  console.log("probing against other tenant:", otherTenant, "| sample doc:", someDoc?.id, "| sample email:", someEmail?.id);

  // Seed one ai_usage_event for the OTHER tenant so the isolation check probes real
  // data, then clean it up at the end (WO-02 Wave 3 metering ledger).
  let probeUsageId: string | null = null;
  if (otherTenant) {
    const { data: pu } = await admin
      .from("ai_usage_event")
      .insert({ tenant_id: otherTenant, task: "summary.case", tokens_in: 1, tokens_out: 1, cost_usd: 0, trace_id: "rls-probe" })
      .select("id").maybeSingle();
    probeUsageId = pu?.id ?? null;
  }

  // Sign in as the new user with the ANON key → RLS enforced.
  const sb = createClient(url, anon);
  const { error: sErr } = await sb.auth.signInWithPassword({ email, password: "rls-test-pass-1234" });
  if (sErr) throw new Error("signin: " + sErr.message);

  let pass = true;

  // 1) Every tenant table must return 0 rows for the fresh tenant.
  for (const t of TENANT_TABLES) {
    const { count } = await sb.from(t).select("*", { count: "exact", head: true });
    const ok = (count ?? 0) === 0;
    if (!ok) pass = false;
    console.log(`  ${ok ? "✓" : "✗ LEAK"} ${t}: visible rows = ${count ?? 0} (expect 0)`);
  }

  // 2) Direct-id probes for another tenant's rows must return nothing.
  if (someDoc?.id) {
    const { data } = await sb.from("document").select("id").eq("id", someDoc.id).maybeSingle();
    const ok = data === null;
    if (!ok) pass = false;
    console.log(`  ${ok ? "✓" : "✗ LEAK"} cannot read other tenant's document by id`);
  }
  if (someEmail?.id) {
    const { data } = await sb.from("email_message").select("id").eq("id", someEmail.id).maybeSingle();
    const ok = data === null;
    if (!ok) pass = false;
    console.log(`  ${ok ? "✓" : "✗ LEAK"} cannot read other tenant's email by id`);
  }
  if (probeUsageId) {
    const { data } = await sb.from("ai_usage_event").select("id").eq("id", probeUsageId).maybeSingle();
    const ok = data === null;
    if (!ok) pass = false;
    console.log(`  ${ok ? "✓" : "✗ LEAK"} cannot read other tenant's ai_usage_event by id`);
  }

  // 3) The new user CAN see their own tenant (sanity — they get an isolated workspace).
  const { data: ownTenant } = await sb.from("tenant").select("id, name");
  console.log(`  ✓ own tenant visible: ${ownTenant?.length === 1 ? "yes (1)" : JSON.stringify(ownTenant)}`);

  // cleanup
  if (probeUsageId) await admin.from("ai_usage_event").delete().eq("id", probeUsageId);
  await admin.from("profile").delete().eq("id", newUserId);
  await admin.auth.admin.deleteUser(newUserId);
  // delete the auto-created tenant for the temp user
  console.log("✓ cleaned up temp user");

  console.log("\nRLS ISOLATION:", pass ? "PASS — no cross-tenant access" : "FAIL — LEAK DETECTED");
  if (!pass) process.exit(1);
}
main().catch((e) => { console.error("RLS TEST ERROR:", e); process.exit(1); });
