// WO-01 tenancy + change-detection test: a court case synced via upsertCase lands ONLY under its
// own tenant_id (RLS proves zero cross-tenant leakage), and a re-sync with a moved hearing fires a
// case.updated activity_event. Mirrors tests/rls_isolation.ts (temp users → bootstrap tenants →
// verify → clean up). Requires .env (Supabase URL + anon + service-role keys).
// Run: set -a; source .env; set +a; npx tsx tests/wo01_tenancy_sync.ts
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { upsertCase } from "@/lib/court/sync";
import { getTenantId } from "@/lib/court/sync";
import type { NormalizedCase } from "@/lib/court/types";

for (const l of (() => { try { return readFileSync(".env", "utf8").split("\n"); } catch { return []; } })()) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !svc) {
  console.log("SKIP: needs NEXT_PUBLIC_SUPABASE_URL + ANON + SERVICE_ROLE keys (source .env). Test written; not run.");
  process.exit(0);
}

const CNR = "WO01TENANCY00001";
let failed = 0;
const ok = (cond: boolean, msg: string) => { if (!cond) { console.error("  FAIL:", msg); failed++; } else console.log("  ✓", msg); };

function synthCase(nextDate: string): NormalizedCase {
  return {
    cnr: CNR, title: "WO01 Test v. State", court: "HC", caseType: "Test", status: "Pending",
    parties: [{ name: "WO01 Test", side: "petitioner" }, { name: "State", side: "respondent" }],
    judges: ["HON. TEST J."], nextHearingDate: nextDate,
    hearings: [{ date: "2026-05-01", purpose: "Hearing", judge: "HON. TEST J." }, { date: nextDate, purpose: "Next hearing (as listed)" }],
    orders: [], acts: [], source: "legaldriver", fetchedAt: new Date().toISOString(),
  };
}

async function tempUser(admin: ReturnType<typeof createClient<Database>>, tag: string) {
  const email = `wo01_${tag}_${Date.now()}@lexdriver.test`;
  const password = "wo01-test-pass-1234";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`create user ${tag}: ${error?.message}`);
  const client = createClient<Database>(url!, anon!, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr) throw new Error(`sign in ${tag}: ${sErr.message}`);
  const tenantId = await getTenantId(client as never);
  if (!tenantId) throw new Error(`no tenant bootstrapped for ${tag}`);
  return { userId: data.user.id, email, client, tenantId };
}

async function main() {
  const admin = createClient<Database>(url!, svc!, { auth: { persistSession: false } });
  const a = await tempUser(admin, "a");
  const b = await tempUser(admin, "b");
  console.log(`✓ temp tenants: A=${a.tenantId.slice(0, 8)} B=${b.tenantId.slice(0, 8)}`);
  ok(a.tenantId !== b.tenantId, "two distinct tenants bootstrapped");

  try {
    // Sync the case under tenant A (admin client, as the cron does — explicit tenant scoping).
    const { matterId, isNew } = await upsertCase(admin as never, a.tenantId, synthCase("2026-07-20"));
    ok(isNew && !!matterId, "upsertCase inserted a new matter under tenant A");

    // Tenant A (RLS-scoped) sees exactly its own matter for this CNR.
    const { data: aRows } = await a.client.from("matter").select("id, tenant_id, source, last_synced_at").eq("cnr", CNR);
    ok((aRows?.length ?? 0) === 1 && aRows![0].tenant_id === a.tenantId, "tenant A sees its synced case (RLS)");
    ok(aRows?.[0]?.source === "legaldriver" && !!aRows?.[0]?.last_synced_at, "provenance (source + last_synced_at) stored");

    // Tenant B (RLS-scoped) sees NONE of it — zero cross-tenant leakage.
    const { data: bRows } = await b.client.from("matter").select("id").eq("cnr", CNR);
    ok((bRows?.length ?? 0) === 0, "tenant B sees ZERO rows for the same CNR (isolation)");

    // Re-sync with a moved next hearing → change detection fires a case.updated activity_event.
    await upsertCase(admin as never, a.tenantId, synthCase("2026-08-05"));
    const { data: ev } = await a.client.from("activity_event").select("id, type, summary").eq("matter_id", matterId).eq("type", "case.updated");
    ok((ev?.length ?? 0) >= 1 && (ev![0].summary ?? "").toLowerCase().includes("next hearing"), "re-sync fired a case.updated activity_event");
  } finally {
    // Cleanup: remove the matter (cascades children) then the temp users.
    await admin.from("matter").delete().eq("cnr", CNR);
    await admin.auth.admin.deleteUser(a.userId);
    await admin.auth.admin.deleteUser(b.userId);
    console.log("✓ cleaned up temp users + matter");
  }

  console.log(failed === 0 ? "\nWO-01 TENANCY SYNC: PASS" : `\nWO-01 TENANCY SYNC: FAIL (${failed})`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
