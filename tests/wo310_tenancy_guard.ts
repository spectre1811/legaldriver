// WO-310 W1+W2 · Tenancy floor — the OFFLINE proof. No live services, no secrets, so it
// runs inside the `build` check on every PR (scripts/run-tests.mjs → OFFLINE group).
//
// Two things are proven here:
//   A. ENUMERATION (W1). `tests/rls_isolation.ts` derives its table list from the
//      migrations rather than a hand-written array. This asserts the derivation is real:
//      drop a brand-new tenant table into a synthetic migrations dir and it appears in the
//      list with nobody editing a test. That is the property that keeps table #46 covered.
//   B. SCHEMA GUARD (W2). Drives the REAL CLI (`node scripts/check-migrations.mjs <dir>`)
//      against fixtures, asserting exit codes + messages for: a table that forgot tenancy,
//      a blanket `true` write policy, an ungated `security definer` function, and — the
//      acceptance case — a real-repo copy with one table's only SELECT policy dropped.
//
// Run: npx tsx tests/wo310_tenancy_guard.ts
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseMigrations, tenantScopedTables } from "../scripts/lib/migration-schema.mjs";

const SCRIPT = "scripts/check-migrations.mjs";
const REAL = "supabase/migrations";

let ok = true;
const fail = (m: string) => { ok = false; console.log(`  ✗ ${m}`); };
const pass = (m: string) => console.log(`  ✓ ${m}`);

function run(dir: string): { code: number; out: string } {
  const r = spawnSync("node", [SCRIPT, dir], { encoding: "utf8" });
  return { code: r.status ?? 1, out: `${r.stdout || ""}${r.stderr || ""}` };
}

function withDir(seed: (dir: string) => void, fn: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "wo310-"));
  try { seed(dir); fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** A minimal, VALID tenant table so fixtures start from a passing baseline. */
const goodTable = (name: string) => `
create table if not exists ${name} (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id) on delete cascade,
  label     text
);
alter table ${name} enable row level security;
create policy ${name}_select on ${name} for select using (tenant_id = current_tenant_id());
create policy ${name}_insert on ${name} for insert with check (tenant_id = current_tenant_id());
`;

// ─────────────────────────────────────────────────────────────────────────────────
// A. Enumeration is DERIVED, not declared.
// ─────────────────────────────────────────────────────────────────────────────────
console.log("A · enumeration from migrations");

const real = tenantScopedTables(REAL);
if (real.length < 40) fail(`expected 40+ tenant-scoped tables in ${REAL}, enumerated ${real.length}`);
else pass(`${real.length} tenant-scoped tables enumerated from ${REAL}`);

// The tables the old 12-entry hand-list missed (WO-310 problem statement) must be covered.
for (const t of ["invoice", "invoice_line", "time_entry", "expense", "agent_turn", "document_chunk", "consent_ledger"]) {
  if (!real.includes(t)) fail(`"${t}" — a previously UNTESTED tenant table — is missing from the enumeration`);
}
pass("the seven named previously-untested tables are all enumerated");

// A brand-new table needs NO test edit to be covered — the whole point of W1.
withDir(
  (d) => {
    writeFileSync(join(d, "0001_init.sql"), goodTable("matter"));
    writeFileSync(join(d, "0002_table_44.sql"), goodTable("some_future_table"));
  },
  (d) => {
    const list = tenantScopedTables(d);
    if (!list.includes("some_future_table")) fail("a new tenant table did not appear in the enumeration");
    else pass("a table added by a NEW migration is enumerated with zero test edits");
  },
);

// Every real tenant-scoped table has RLS + a readable policy (the model the guard enforces).
{
  const { tables } = parseMigrations(REAL);
  const broken = [...tables.values()].filter(
    (t) => t.hasTenantId && (!t.rlsEnabled || !t.policies.some((p) => p.cmd === "select" || p.cmd === "all")),
  );
  if (broken.length) fail(`tenant tables without RLS or a readable policy: ${broken.map((t) => t.name).join(", ")}`);
  else pass("every enumerated tenant table has RLS + a readable policy");
  // The parser must resolve non-`id` primary keys, or the direct-key probe skips them.
  if (tables.get("capture_token")?.primaryKey[0] !== "token") fail("capture_token primary key not resolved (expected `token`)");
  if (tables.get("firm_billing")?.primaryKey[0] !== "tenant_id") fail("firm_billing primary key not resolved (expected `tenant_id`)");
  else pass("non-`id` primary keys resolved (capture_token.token, firm_billing.tenant_id)");
}

// ─────────────────────────────────────────────────────────────────────────────────
// B. The schema guard.
// ─────────────────────────────────────────────────────────────────────────────────
console.log("B · schema guard (scripts/check-migrations.mjs)");

// B0. The real repo passes — the guard is calibrated to today's schema, not aspirational.
{
  const { code, out } = run(REAL);
  if (code !== 0) fail(`real ${REAL} must pass the guard:\n${out.trim()}`);
  else pass("the real supabase/migrations passes");
}

// B1. A table that forgot tenancy fails.
withDir(
  (d) => {
    writeFileSync(join(d, "0001_init.sql"), goodTable("matter"));
    writeFileSync(join(d, "0002_new_feature.sql"), "create table if not exists shiny_new_thing (\n  id uuid primary key,\n  payload jsonb not null\n);\n");
  },
  (d) => {
    const { code, out } = run(d);
    if (code !== 1) fail(`a table with no tenant_id/RLS should exit 1, got ${code}`);
    if (!out.includes("shiny_new_thing") || !out.includes("tenant_id")) fail("the error must name the table and what it is missing");
    else pass("table without tenant_id + RLS + policy → FAIL");
  },
);

// B2. tenant_id + RLS but NO policy fails (deny-all is not tenancy — it is a dead table).
withDir(
  (d) => writeFileSync(join(d, "0001_init.sql"), `create table thing (\n  id uuid primary key,\n  tenant_id uuid not null\n);\nalter table thing enable row level security;\n`),
  (d) => {
    const { code, out } = run(d);
    if (code !== 1 || !out.includes("at least one policy")) fail(`tenant table with no policy should fail; got ${code}: ${out.trim()}`);
    else pass("tenant table with RLS but no policy → FAIL");
  },
);

// B3. A blanket `true` predicate on a tenant-scoped table fails; SELECT-only `true` on
//     public reference data (legal_reference, corpus_judgment) still passes.
withDir(
  (d) => writeFileSync(join(d, "0001_init.sql"), goodTable("gadget") + "create policy gadget_all on gadget for all using (true) with check (true);\n"),
  (d) => {
    const { code, out } = run(d);
    if (code !== 1 || !out.includes("using (true)")) fail(`\`using (true)\` for \`all\` should fail; got ${code}: ${out.trim()}`);
    else pass("`using (true)` write policy on a tenant table → FAIL");
  },
);
withDir(
  (d) => writeFileSync(join(d, "0001_ref.sql"), "create table court_cache (\n  id uuid primary key,\n  blob jsonb\n);\nalter table court_cache enable row level security;\ncreate policy court_cache_read on court_cache for select using (true);\n"),
  (d) => {
    const { code, out } = run(d);
    if (code !== 0) fail(`SELECT-only \`using (true)\` on allowlisted reference data must pass; got ${code}: ${out.trim()}`);
    else pass("SELECT-only `using (true)` on an allowlisted reference table → PASS");
  },
);

// B4. A `security definer` function must be revoked from anon + authenticated.
const definerFn = `
create or replace function danger_fn(p uuid)
returns void
language plpgsql
security definer
set search_path = public as $f$
begin
  delete from gadget;
end $f$;
`;
withDir(
  (d) => writeFileSync(join(d, "0001_init.sql"), goodTable("gadget") + definerFn),
  (d) => {
    const { code, out } = run(d);
    if (code !== 1 || !out.includes("danger_fn")) fail(`ungated security-definer function should fail; got ${code}: ${out.trim()}`);
    else pass("`security definer` without a revoke → FAIL");
  },
);
withDir(
  (d) => writeFileSync(join(d, "0001_init.sql"), goodTable("gadget") + definerFn + "revoke all on function public.danger_fn(uuid) from public, anon, authenticated;\n"),
  (d) => {
    const { code, out } = run(d);
    if (code !== 0) fail(`a revoked security-definer function must pass; got ${code}: ${out.trim()}`);
    else pass("`security definer` + `revoke … from anon, authenticated` → PASS");
  },
);

// B5. ACCEPTANCE: a deliberately-broken policy on a copy of the REAL schema fails.
//     Dropping agent_turn's only SELECT policy leaves the table write-only — invisible to
//     the app and unprovable by the isolation test. The guard refuses it.
withDir(
  (d) => {
    cpSync(REAL, d, { recursive: true });
    writeFileSync(join(d, "20260730120000_break_agent_turn.sql"), "drop policy if exists agent_turn_select on agent_turn;\n");
  },
  (d) => {
    const { code, out } = run(d);
    if (code !== 1 || !out.includes("agent_turn")) fail(`dropping agent_turn's SELECT policy should fail the guard; got ${code}: ${out.trim()}`);
    else pass("real schema + a dropped SELECT policy → FAIL (acceptance demo, statically)");
  },
);

// B6. ACCEPTANCE: widening a real policy to `using (true)` fails too.
withDir(
  (d) => {
    cpSync(REAL, d, { recursive: true });
    writeFileSync(
      join(d, "20260730120000_widen_document.sql"),
      "drop policy if exists document_select on document;\ncreate policy document_select on document for select using (true);\n",
    );
  },
  (d) => {
    const { code, out } = run(d);
    if (code !== 1 || !out.includes("document_select")) fail(`widening document_select to \`true\` should fail; got ${code}: ${out.trim()}`);
    else pass("real schema + a `using (true)` SELECT policy on a tenant table → FAIL");
  },
);

// ─────────────────────────────────────────────────────────────────────────────────
// C. The two halves of the merge gate agree.
// ─────────────────────────────────────────────────────────────────────────────────
console.log("C · CI wiring");

{
  const dbYml = readFileSync(".github/workflows/db-tests.yml", "utf8");
  const amYml = readFileSync(".github/workflows/automerge.yml", "utf8");

  // db-tests must actually run on pull_request — otherwise the check never appears and
  // automerge's requirement is unenforceable (the exact pre-WO-310 state).
  if (!/^on:[\s\S]*?^\s{2}pull_request:/m.test(dbYml)) fail("db-tests.yml does not trigger on `pull_request`");
  else pass("db-tests.yml runs on pull_request");

  if (!/REQUIRED[\s\S]{0,400}?match:\s*'db-tests'/.test(amYml)) fail("automerge.yml does not list db-tests as a required check");
  else pass("automerge.yml requires the db-tests check");

  // The scope regex is duplicated by necessity (shell ERE vs JS). Assert they match, so
  // a path added to one is never silently missing from the other.
  const shell = dbYml.match(/grep -qE '(\^\([^']+\))'/)?.[1];
  const js = amYml.match(/const DB_SURFACE_RE = \/(.+?)\/;/)?.[1];
  if (!shell || !js) fail(`could not locate the DB-surface pattern in both workflows (shell=${shell}, js=${js})`);
  else if (shell !== js.replace(/\\\//g, "/")) fail(`DB-surface patterns have DRIFTED:\n      db-tests.yml : ${shell}\n      automerge.yml: ${js.replace(/\\\//g, "/")}`);
  else pass("the DB-surface path pattern is identical in db-tests.yml and automerge.yml");
}

console.log(ok ? "\nWO-310 TENANCY GUARD: PASS" : "\nWO-310 TENANCY GUARD: FAIL");
process.exit(ok ? 0 : 1);
