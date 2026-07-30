// WO-311 · Two mapped receiving identities, two tenants, zero crossover.
//
// The direct-id probe, same shape as `rls_isolation.ts` (which is exactly why it
// exists: "the policies look right" is what the probe was invented to distrust).
// Needs a live Supabase + .env → the `db` group, where `supabase start` has
// applied every migration in the repo including this WO's (inert in prod, live
// in the ephemeral CI stack).
//
// It proves three things the offline suite cannot:
//   1. a message routed to tenant B is invisible to tenant A by direct id;
//   2. the mapping row itself is invisible across tenants;
//   3. no tenant can WRITE a mapping — the routing-hijack primitive (claim an
//      identity your competitor is about to onboard) is closed by the absence of
//      an insert/update policy, not by convention.
// Run: npx tsx tests/wo311_messaging_isolation.ts
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const l of readFileSync(".env", "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PASSWORD = "wo311-test-pass-1234";

let pass = true;
const check = (label: string, cond: boolean, extra?: unknown) => {
  if (!cond) pass = false;
  console.log(`  ${cond ? "✓" : "✗ LEAK"} ${label}${extra === undefined ? "" : ` — ${JSON.stringify(extra)}`}`);
};

async function main() {
  const admin = createClient(url, svc, { auth: { persistSession: false } });
  const stamp = Date.now();
  const created: string[] = [];

  // Two firms, born the way the product makes them: a signup each.
  const makeFirm = async (tag: string) => {
    const email = `wo311_${tag}_${stamp}@lexdriver.test`;
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error) throw new Error(`create user ${tag}: ${error.message}`);
    const userId = data.user!.id;
    created.push(userId);
    const { data: prof } = await admin.from("profile").select("tenant_id").eq("id", userId).single();
    return { email, userId, tenantId: prof!.tenant_id as string };
  };

  const firmA = await makeFirm("a");
  const firmB = await makeFirm("b");
  console.log(`✓ two tenants: A=${firmA.tenantId} B=${firmB.tenantId}`);

  // Two receiving identities → two tenants (the whole point of the WO).
  const identityA = `1099311${stamp}A`;
  const identityB = `1099311${stamp}B`;
  const { data: mapRows, error: mapErr } = await admin
    .from("messaging_identity")
    .insert([
      { tenant_id: firmA.tenantId, channel: "whatsapp", identity: identityA, label: "WO-311 test A" },
      { tenant_id: firmB.tenantId, channel: "whatsapp", identity: identityB, label: "WO-311 test B" },
    ])
    .select("id, tenant_id");
  if (mapErr) throw new Error(`seed messaging_identity (is the WO-311 migration applied?): ${mapErr.message}`);
  const mapA = mapRows!.find((r) => r.tenant_id === firmA.tenantId)!;
  const mapB = mapRows!.find((r) => r.tenant_id === firmB.tenantId)!;

  // The same receiving identity can never belong to two firms.
  const { error: dupErr } = await admin
    .from("messaging_identity")
    .insert({ tenant_id: firmB.tenantId, channel: "whatsapp", identity: identityA });
  check("a second tenant cannot claim an already-mapped identity (unique index)", Boolean(dupErr), dupErr?.message);

  // One inbound message per firm, as the webhook would have written them.
  const { data: msgs, error: msgErr } = await admin
    .from("msg_message")
    .insert([
      {
        tenant_id: firmA.tenantId, channel: "whatsapp", direction: "in", provider: "test",
        external_id: `wamid.wo311.a.${stamp}`, thread_key: "whatsapp:919812300001",
        from_addr: "919812300001", to_addr: identityA, body: "A's client message", status: "received",
      },
      {
        tenant_id: firmB.tenantId, channel: "whatsapp", direction: "in", provider: "test",
        external_id: `wamid.wo311.b.${stamp}`, thread_key: "whatsapp:919812300002",
        from_addr: "919812300002", to_addr: identityB, body: "B's client message", status: "received",
      },
    ])
    .select("id, tenant_id");
  if (msgErr) throw new Error(`seed msg_message: ${msgErr.message}`);
  const msgA = msgs!.find((r) => r.tenant_id === firmA.tenantId)!;
  const msgB = msgs!.find((r) => r.tenant_id === firmB.tenantId)!;

  // Sign in as firm A with the ANON key → RLS enforced.
  const sb = createClient(url, anon);
  const { error: sErr } = await sb.auth.signInWithPassword({ email: firmA.email, password: PASSWORD });
  if (sErr) throw new Error("signin A: " + sErr.message);

  // 1) Direct-id probes across the boundary.
  const { data: seenMsgB } = await sb.from("msg_message").select("id").eq("id", msgB.id).maybeSingle();
  check("tenant A cannot read tenant B's inbound message by id", seenMsgB === null, seenMsgB);
  const { data: seenMapB } = await sb.from("messaging_identity").select("id").eq("id", mapB.id).maybeSingle();
  check("tenant A cannot read tenant B's messaging_identity row by id", seenMapB === null, seenMapB);
  const { count: msgCount } = await sb.from("msg_message").select("*", { count: "exact", head: true });
  check("tenant A sees exactly its OWN one message", (msgCount ?? 0) === 1, msgCount);

  // 2) The sanity half: A does see its own rows (the policy is not just "deny").
  const { data: ownMsg } = await sb.from("msg_message").select("id").eq("id", msgA.id).maybeSingle();
  check("tenant A can read its own message", ownMsg?.id === msgA.id);
  const { data: ownMap } = await sb.from("messaging_identity").select("id, identity").eq("id", mapA.id).maybeSingle();
  check("tenant A can read its own mapping", ownMap?.id === mapA.id);

  // 3) No tenant may WRITE a mapping — the routing-hijack primitive is closed.
  const { error: hijackOwn } = await sb
    .from("messaging_identity")
    .insert({ tenant_id: firmA.tenantId, channel: "whatsapp", identity: `hijack-own-${stamp}` });
  check("tenant A cannot INSERT a mapping even for itself", Boolean(hijackOwn), hijackOwn?.message);
  const { error: hijackOther } = await sb
    .from("messaging_identity")
    .insert({ tenant_id: firmB.tenantId, channel: "whatsapp", identity: `hijack-other-${stamp}` });
  check("tenant A cannot INSERT a mapping for tenant B", Boolean(hijackOther), hijackOther?.message);
  const { error: stealErr, count: stolen } = await sb
    .from("messaging_identity")
    .update({ tenant_id: firmA.tenantId }, { count: "exact" })
    .eq("id", mapB.id);
  check("tenant A cannot re-point tenant B's mapping at itself", Boolean(stealErr) || (stolen ?? 0) === 0, stealErr?.message);
  const { error: delErr, count: deleted } = await sb
    .from("messaging_identity")
    .delete({ count: "exact" })
    .eq("id", mapA.id);
  check("no tenant can DELETE a mapping (provisioning is service-role only)", Boolean(delErr) || (deleted ?? 0) === 0, delErr?.message);

  // cleanup
  await admin.from("msg_message").delete().in("id", [msgA.id, msgB.id]);
  await admin.from("messaging_identity").delete().in("id", [mapA.id, mapB.id]);
  for (const id of created) {
    await admin.from("profile").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log("✓ cleaned up temp users, mappings and messages");

  console.log("\nWO-311 MESSAGING ISOLATION:", pass ? "PASS — two identities, two tenants, no crossover" : "FAIL — LEAK DETECTED");
  if (!pass) process.exit(1);
}

main().catch((e) => {
  console.error("WO-311 ISOLATION TEST ERROR:", e);
  process.exit(1);
});
