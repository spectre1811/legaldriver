// P8 client-portal isolation test. A portal user must see ONLY their own client's
// matters/hearings/shared-docs/messages and NOTHING else (other clients, other
// tenants, firm-only tables). Creates a temp portal user, verifies, cleans up.
// Run: npx tsx tests/portal_isolation.ts
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const l of readFileSync(".env", "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PASS = "portal-test-pass-1234";

async function main() {
  const admin = createClient(url, svc, { auth: { persistSession: false } });

  // Pick a client (with a matter) to attach the portal user to.
  const { data: m } = await admin.from("matter").select("id, tenant_id, client_id").not("client_id", "is", null).limit(1).maybeSingle();
  if (!m?.client_id) throw new Error("no client-linked matter to test against");
  const { tenant_id, client_id } = m;
  const ourMatterId = m.id;

  // A matter from a DIFFERENT client/tenant to probe negative access.
  const { data: other } = await admin.from("matter").select("id, client_id, tenant_id").neq("client_id", client_id).limit(1).maybeSingle();

  const email = `portaltest_${Date.now()}@lexdriver.test`;
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, password: PASS, email_confirm: true, user_metadata: { is_portal: true },
  });
  if (cErr) throw new Error("create portal user: " + cErr.message);
  const uid = created.user!.id;
  await admin.from("portal_user").insert({ id: uid, tenant_id, client_id });

  // Share exactly one document with the portal (others must stay hidden).
  const { data: aDoc } = await admin.from("document").select("id").eq("tenant_id", tenant_id).limit(1).maybeSingle();
  if (aDoc) await admin.from("document").update({ portal_shared: true }).eq("id", aDoc.id);

  // The trigger must NOT have created a firm profile for the portal user.
  const { data: prof } = await admin.from("profile").select("id").eq("id", uid).maybeSingle();
  let pass = true;
  const check = (ok: boolean, label: string) => { if (!ok) pass = false; console.log(`  ${ok ? "✓" : "✗ LEAK"} ${label}`); };
  check(prof === null, "portal user has NO firm profile row");

  // Sign in as the portal user (anon key → RLS as portal).
  const sb = createClient(url, anon);
  const { error: sErr } = await sb.auth.signInWithPassword({ email, password: PASS });
  if (sErr) throw new Error("portal signin: " + sErr.message);

  // Positive: sees own client + own matters.
  const { data: cli } = await sb.from("client").select("id");
  check(cli?.length === 1 && cli[0].id === client_id, "sees exactly its own client (1)");
  const { data: mats } = await sb.from("matter").select("id, client_id");
  check((mats ?? []).length > 0 && (mats ?? []).every((x) => x.client_id === client_id), "matters all belong to its client");

  // Negative: cannot see another client's / tenant's matter, even by id.
  if (other?.id) {
    const { data: o } = await sb.from("matter").select("id").eq("id", other.id).maybeSingle();
    check(o === null, "cannot read another client's matter by id");
  }
  // Firm-only tables must be empty for the portal user.
  for (const t of ["email_message", "notice", "time_entry", "advocate", "audit_event"]) {
    const { count } = await sb.from(t).select("*", { count: "exact", head: true });
    check((count ?? 0) === 0, `firm-only ${t} not visible (0)`);
  }
  // Documents: only shared ones.
  const { data: docs } = await sb.from("document").select("id, portal_shared");
  check((docs ?? []).every((d) => d.portal_shared === true), "only portal-shared documents visible");

  // Messaging: client can post; firm-sender insert must be rejected by RLS.
  const ins = await sb.from("portal_message").insert({ tenant_id, client_id, matter_id: ourMatterId, sender: "client", sender_user_id: uid, body: "Test from portal" });
  check(!ins.error, "portal user CAN post a client message");
  const insFirm = await sb.from("portal_message").insert({ tenant_id, client_id, sender: "firm", body: "spoof" });
  check(insFirm.error !== null, "portal user CANNOT post as the firm");

  // cleanup
  await admin.from("portal_message").delete().eq("sender_user_id", uid);
  if (aDoc) await admin.from("document").update({ portal_shared: false }).eq("id", aDoc.id);
  await admin.from("portal_user").delete().eq("id", uid);
  await admin.auth.admin.deleteUser(uid);

  console.log("\nPORTAL ISOLATION:", pass ? "PASS — strict per-client isolation holds" : "FAIL — LEAK");
  if (!pass) process.exit(1);
}
main().catch((e) => { console.error("PORTAL TEST ERROR:", e); process.exit(1); });
