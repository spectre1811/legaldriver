// RLS tenant-isolation test: a second user must see NONE of another tenant's data,
// even when querying specific row ids. Creates a temp user, verifies, cleans up.
// Run: npx tsx tests/rls_isolation.ts
//
// WO-310 W1 · The table list is ENUMERATED FROM THE MIGRATIONS, not hand-written.
// The old array covered 12 of 45 tenant-scoped tables — invoice, invoice_line, time_entry,
// expense, agent_turn, document_chunk, consent_ledger … were all unprobed, and nothing
// noticed, because a hand-list silently stops growing. `parseMigrations()` reads
// `supabase/migrations/*.sql` at test time, so table #46 is covered the moment its
// migration lands, with no edit here. It is the SAME parser the CI schema guard uses
// (`scripts/check-migrations.mjs`), so the guard and this proof cannot disagree about
// what "tenant-scoped" means.
//
// Three probes per table:
//   1. NEGATIVE  — a fresh, unrelated tenant must see no row owned by another tenant.
//      (Not "0 rows": the signup trigger seeds each new tenant its own practice areas,
//      deadline rules and draft templates. The invariant is ownership, not emptiness.)
//   2. DIRECT-ID — it must not read a KNOWN foreign row by primary key. This is the
//      probe that catches a policy which is secretly `true`: an empty result can also
//      mean "the table happens to be empty", a primary-key hit cannot. The key column
//      comes from the parser (capture_token is keyed on `token`, firm_billing on
//      `tenant_id` — a hardcoded "id" would have skipped both).
//   3. POSITIVE  — the seeded demo tenant must still SEE what it owns, and never more.
//      Without this, a policy dropped or narrowed to nothing would sail through the
//      negative probes: exactly the WO-67 failure mode where the DB tests stopped
//      protecting anyone and stayed green.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { parseMigrations } from "../scripts/lib/migration-schema.mjs";

for (const l of readFileSync(".env", "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "demo@lexdriver.test";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "peshi-demo-1234";

// Derived, not declared.
const { tables } = parseMigrations("supabase/migrations");
const TENANT_TABLES = [...tables.values()].filter((t) => t.hasTenantId).sort((a, b) => a.name.localeCompare(b.name));

async function main() {
  const admin = createClient(url, svc, { auth: { persistSession: false } });
  const email = `rlstest_${Date.now()}@lexdriver.test`;
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, password: "rls-test-pass-1234", email_confirm: true,
  });
  if (cErr) throw new Error("create user: " + cErr.message);
  const newUserId = created.user!.id;
  console.log("✓ created temp user", email);
  console.log(`✓ enumerated ${TENANT_TABLES.length} tenant-scoped table(s) from supabase/migrations:`);
  console.log(`  ${TENANT_TABLES.map((t) => t.name).join(", ")}`);

  const { data: myProfile } = await admin.from("profile").select("tenant_id").eq("id", newUserId).maybeSingle();
  const myTenant = myProfile?.tenant_id as string | undefined;
  if (!myTenant) throw new Error("signup trigger did not create a tenant for the temp user");

  // Sign in as the new user with the ANON key → RLS enforced.
  const sb = createClient(url, anon);
  const { error: sErr } = await sb.auth.signInWithPassword({ email, password: "rls-test-pass-1234" });
  if (sErr) throw new Error("signin: " + sErr.message);

  let pass = true;
  const fail = (msg: string) => { pass = false; console.log(`  ✗ LEAK  ${msg}`); };

  // ── 1 + 2) Per table ────────────────────────────────────────────────────────────
  let probed = 0;
  const unprobed: string[] = [];
  for (const t of TENANT_TABLES) {
    const pk = t.primaryKey.length ? t.primaryKey : ["id"];
    const cols = [...new Set([...pk, "tenant_id"])].join(",");

    // 1) Nothing visible may belong to another tenant.
    const { data: visible, error: vErr } = await sb.from(t.name).select("tenant_id");
    if (vErr) {
      fail(`${t.name}: could not read as the fresh tenant — ${vErr.message} (a grant/schema problem masks RLS)`);
    } else {
      const rows = visible ?? [];
      const foreignRows = rows.filter((r) => r.tenant_id !== null && r.tenant_id !== myTenant);
      const shared = rows.filter((r) => r.tenant_id === null).length;
      if (foreignRows.length) {
        fail(`${t.name}: ${foreignRows.length} row(s) belong to another tenant (e.g. ${foreignRows[0].tenant_id})`);
      } else {
        console.log(
          `  ✓ ${t.name.padEnd(24)} visible=${String(rows.length).padStart(3)} own=${rows.length - shared} foreign=0` +
            (shared ? ` shared(null tenant)=${shared}` : ""),
        );
      }
    }

    // 2) A known foreign row must not be readable by primary key.
    const { data: foreign, error: fErr } = await admin
      .from(t.name).select(cols).neq("tenant_id", myTenant).limit(1).maybeSingle();
    if (fErr || !foreign) {
      unprobed.push(fErr ? `${t.name} (${fErr.message})` : t.name);
      continue;
    }
    probed++;
    const foreignRow = foreign as unknown as Record<string, unknown>;
    let q = sb.from(t.name).select(pk[0]);
    for (const c of pk) q = q.eq(c, foreignRow[c]);
    const { data: hit } = await q.maybeSingle();
    if (hit !== null && hit !== undefined) {
      fail(`${t.name}: read another tenant's row BY PRIMARY KEY (${pk.join("+")}) — the policy is not tenant-scoped`);
    } else {
      console.log(`      ↳ direct-key probe on a foreign ${t.name} row → nothing`);
    }
  }
  console.log(
    `  · direct-key probes ran on ${probed}/${TENANT_TABLES.length} tables; ` +
      `no foreign fixture row (probe not applicable): ${unprobed.join(", ") || "none"}`,
  );

  // ── 3) Positive control: the seeded demo tenant still sees what it owns ─────────
  const demo = createClient(url, anon);
  const { error: dErr } = await demo.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
  if (dErr) {
    fail(`positive control unavailable — could not sign in as ${DEMO_EMAIL}: ${dErr.message}`);
  } else {
    const demoUserId = (await demo.auth.getUser()).data.user!.id;
    const { data: dp } = await admin.from("profile").select("tenant_id").eq("id", demoUserId).maybeSingle();
    const demoTenant = dp?.tenant_id as string;
    let checked = 0;
    for (const t of TENANT_TABLES) {
      const { count: owned } = await admin.from(t.name).select("*", { count: "exact", head: true }).eq("tenant_id", demoTenant);
      if (!owned) continue; // nothing seeded here — nothing to assert
      const { count: seen } = await demo.from(t.name).select("*", { count: "exact", head: true });
      checked++;
      // `<` is legitimate down to 1 (matter's SELECT policy hides soft-deleted rows);
      // 0 is not — that means the tenant lost sight of its own data. `>` is a leak.
      if ((seen ?? 0) === 0) fail(`${t.name}: demo tenant owns ${owned} row(s) but sees 0 — its SELECT policy is gone or unreachable`);
      else if ((seen ?? 0) > owned) fail(`${t.name}: demo tenant owns ${owned} row(s) but sees ${seen} — the policy is too wide`);
    }
    console.log(`  ✓ positive control: demo tenant still sees its own rows in ${checked} populated table(s)`);
  }

  // 4) The new user CAN see their own tenant (sanity — they get an isolated workspace).
  const { data: ownTenant } = await sb.from("tenant").select("id, name");
  if (ownTenant?.length !== 1 || ownTenant[0].id !== myTenant) {
    fail(`own tenant row not visible exactly once: ${JSON.stringify(ownTenant)}`);
  } else {
    console.log("  ✓ own tenant visible (exactly 1)");
  }

  // cleanup
  await admin.from("profile").delete().eq("id", newUserId);
  await admin.auth.admin.deleteUser(newUserId);
  await admin.from("tenant").delete().eq("id", myTenant);
  console.log("✓ cleaned up temp user + its tenant");

  console.log(
    "\nRLS ISOLATION:",
    pass ? `PASS — no cross-tenant access across ${TENANT_TABLES.length} tenant-scoped tables` : "FAIL — LEAK DETECTED",
  );
  if (!pass) process.exit(1);
}
main().catch((e) => { console.error("RLS TEST ERROR:", e); process.exit(1); });
