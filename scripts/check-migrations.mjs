// WO-41 · Migration-filename collision guard  ·  WO-310 W2 · Tenancy schema guard.
// Zero-dependency, Node built-ins only.
//
// Why this exists: the sequential `NNNN_` migration scheme is collision-prone under the
// parallel multi-agent fleet. Two work orders each grabbed `0031_` (WO-29
// `0031_email_status_archive`, WO-30 `0031_profile_notification_prefs`) — both got applied,
// but two migrations sharing one version apply in an ambiguous order and a rebuild-from-
// migrations runs both under one number → repo↔DB drift. This guard makes that class of
// mistake fail CI instead of silently landing.
//
// WO-310 extends it from a NAMING guard to a TENANCY guard. Tenant isolation used to be
// asserted by convention: nothing failed CI when migration #44 shipped a table with no
// `tenant_id`, no RLS, or a policy that was secretly `true`. With 43 migrations produced by
// a parallel agent fleet, that is where the first real leak arrives. Now it fails here,
// on every PR, before a human sees it (this script runs inside the `build` check via
// `tests/wo41_migration_guard.ts` + `tests/wo310_tenancy_guard.ts` in the offline suite).
//
// What it checks in `supabase/migrations/`:
//   1. Naming shape: `<version>_<slug>.sql` (version = 4-digit legacy NNNN or 14-digit
//      Supabase timestamp; slug = lowercase a-z0-9, `_`-separated).
//   2. Version uniqueness: no two migrations may share a version (the real bug).
//   3. TENANCY (WO-310): every `create table` carries `tenant_id`, has RLS enabled, and has
//      at least one policy including a readable (SELECT- or ALL-command) one — or appears in
//      the explicit `TENANCY_EXEMPT` allowlist below.
//   4. NO BLANKET WRITE POLICY (WO-310): a `using (true)` / `with check (true)` policy is only
//      legitimate for SELECT on a non-tenant-scoped table (public reference data). Anywhere
//      else it is a hole.
//   5. DEFINER GATING (WO-310): a `security definer` function must be followed by a
//      `revoke … on function … from … anon, authenticated` — or appear in `DEFINER_EXEMPT`.
//
// Run:  node scripts/check-migrations.mjs            # checks supabase/migrations
//       node scripts/check-migrations.mjs <dir>      # checks an arbitrary dir (tests use this)
// Exit: 0 = clean, 1 = violations (printed), 2 = dir unreadable.
//
// Going forward, create migrations with `supabase migration new <slug>` — it stamps a unique
// timestamp version, so collisions are impossible by construction. See
// docs/decisions/2026-07-05-migration-naming-collision-guard.md.

import { readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseMigrations } from "./lib/migration-schema.mjs";

// KNOWN, ALREADY-APPLIED historical collision — grandfathered, NOT renamed. Both files are
// recorded in the live `supabase_migrations.schema_migrations`; renaming one would make
// Supabase treat it as new and re-run it (a founder-gated DB op). We accept the debt and
// bar it from growing. Do NOT add entries here — a new collision is a bug to fix, not to allow.
export const GRANDFATHERED = { "0031": 2 };

// ─────────────────────────────────────────────────────────────────────────────────────
// WO-310 W2 · TENANCY_EXEMPT — the ONLY tables allowed to exist without `tenant_id`.
// Each entry states why it is not tenant-owned. Adding a line here is a deliberate,
// reviewable act: if a new table needs an entry, that is the conversation the guard exists
// to force. Everything else MUST carry tenant_id + RLS + at least one readable policy.
// ─────────────────────────────────────────────────────────────────────────────────────
export const TENANCY_EXEMPT = {
  tenant: "the tenant registry itself — scoped by `id = current_tenant_id()`, not tenant_id.",
  court_cache: "shared court-data cache (public court record); service-role writes, RLS on, no client policy.",
  court_provider_health: "shared provider telemetry; service-role only, RLS on, no client policy.",
  cron_lock: "WO-355 cron lease mutex — infra table, service-role rpc only; RLS on, no policies by design.",
  refresh_lock: "WO-359 in-flight refresh coalescing lock — infra table keyed on CNR (public court data, not tenant-owned); service-role rpc only, RLS on, no policies by design.",
  legal_reference: "public statutory reference spine (IPC↔BNS maps); world-readable by design.",
  corpus_judgment: "public CC-BY court judgments; world-readable by design, service-role writes.",
  corpus_source_batch: "corpus ingest bookkeeping; service-role only, RLS on, no client policy.",
  corpus_ingest_watermark: "corpus ingest bookkeeping; service-role only, RLS on, no client policy.",
  access_requests:
    "WO-272 invite-only intake — a request exists BEFORE any tenant, so it cannot carry one. " +
    "RLS on with NO policy = deny-all to anon/authenticated; only the server-only service-role touches it.",
};

// ─────────────────────────────────────────────────────────────────────────────────────
// WO-310 W2 · DEFINER_EXEMPT — `security definer` functions that intentionally stay
// EXECUTE-able by anon/authenticated. A definer function runs with the owner's rights and
// therefore bypasses RLS: any NEW one must be revoked from anon+authenticated (the
// `store_secret` / `read_secret` pattern in 0002) unless it is listed here with a reason.
// ─────────────────────────────────────────────────────────────────────────────────────
export const DEFINER_EXEMPT = {
  current_tenant_id:
    "THE RLS predicate itself — every tenant policy calls it; authenticated MUST be able to execute it. " +
    "Returns only the caller's own tenant (`where id = auth.uid()`), so it leaks nothing.",
  portal_tenant_id: "same shape as current_tenant_id for the client-portal role; keyed to auth.uid().",
  portal_client_id: "same shape as current_tenant_id for the client-portal role; keyed to auth.uid().",
  handle_new_user: "auth.users INSERT trigger — invoked by GoTrue, not callable in a useful way by a client.",
  analytics_summary: "read-only aggregate; definer so it can also count shared-infra rows (court_cache).",
  seed_draft_templates:
    "OPEN QUESTION, not a clean grandfather: 0020 defines it definer with NO revoke, unlike store_secret " +
    "(0002:30-33). WO-310 W4(a) must confirm the live grant and codify the revoke; until then it is pinned " +
    "here so the guard is honest about the debt rather than silently ignoring it.",
  get_provider_health:
    "INTENTIONALLY anon-callable — the external GChat alarm poller (.github/workflows/health-alarm.yml) hits " +
    "it with the anon key. Definer + `grant to anon, authenticated` is by design (WO-290, applied to prod " +
    "2026-07-31). Returns only provider/ok/updated_at for 4 named infra providers — no tenant data, no PII, " +
    "no error bodies — so bypassing RLS leaks nothing. Revoking would break the health alarm.",
};

const DEFAULT_DIR = "supabase/migrations";
const NAME_RE = /^(\d{4}|\d{14})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;
const READABLE_CMDS = new Set(["select", "all"]);

/**
 * @param {string} dir
 * @returns {{ ok: boolean, errors: string[], files: string[] }}
 */
export function checkMigrations(dir = DEFAULT_DIR) {
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  } catch (e) {
    return { ok: false, errors: [`cannot read ${dir}: ${e.message}`], files: [] };
  }

  const errors = [];

  // 1. Naming shape.
  for (const f of files) {
    if (!NAME_RE.test(f)) {
      errors.push(
        `bad name "${f}" — expected <version>_<slug>.sql ` +
          `(version = 4-digit NNNN or 14-digit timestamp; slug = lowercase a-z0-9, _-separated).`,
      );
    }
  }

  // 2. Version uniqueness (the collision the fleet actually hits).
  const byVersion = {};
  for (const f of files) {
    const v = f.split("_")[0];
    (byVersion[v] ||= []).push(f);
  }
  for (const [v, group] of Object.entries(byVersion)) {
    const allowed = GRANDFATHERED[v] ?? 1;
    if (group.length > allowed) {
      const suffix =
        allowed > 1
          ? `"${v}" is grandfathered for at most ${allowed} files (${GRANDFATHERED[v]}) — no more may be added.`
          : `two migrations must never share a version.`;
      errors.push(
        `duplicate migration version "${v}" — ${group.length} files: ${group.join(", ")}. ${suffix} ` +
          `Create new migrations with \`supabase migration new <slug>\` (unique timestamp). ` +
          `See docs/decisions/2026-07-05-migration-naming-collision-guard.md.`,
      );
    }
  }

  errors.push(...tenancyErrors(dir));

  return { ok: errors.length === 0, errors, files };
}

/**
 * WO-310 W2 · Rules 3–5, driven by the shared static model in `lib/migration-schema.mjs`
 * (the SAME model `tests/rls_isolation.ts` enumerates its table list from — one parser,
 * so the guard and the runtime proof can never disagree about what "tenant-scoped" means).
 * @param {string} dir
 * @returns {string[]}
 */
export function tenancyErrors(dir = DEFAULT_DIR) {
  const errors = [];
  let model;
  try {
    model = parseMigrations(dir);
  } catch (e) {
    return [`cannot parse migrations in ${dir}: ${e.message}`];
  }

  // 3. Every table is tenant-scoped, or explicitly exempt.
  for (const t of model.tables.values()) {
    const exemptReason = Object.prototype.hasOwnProperty.call(TENANCY_EXEMPT, t.name)
      ? TENANCY_EXEMPT[t.name]
      : null;

    if (exemptReason !== null) {
      if (t.hasTenantId) {
        errors.push(
          `table "${t.name}" (${t.file}) is in TENANCY_EXEMPT but DOES carry tenant_id — ` +
            `the allowlist entry is stale. Remove it from TENANCY_EXEMPT in scripts/check-migrations.mjs.`,
        );
      }
      continue;
    }

    const missing = [];
    if (!t.hasTenantId) missing.push("a `tenant_id` column");
    if (!t.rlsEnabled) missing.push("`enable row level security`");
    if (!t.policies.length) missing.push("at least one policy");
    else if (!t.policies.some((p) => READABLE_CMDS.has(p.cmd))) {
      missing.push("a readable policy (`for select` or `for all`) — with none, the table is invisible to the app");
    }
    if (missing.length) {
      errors.push(
        `table "${t.name}" (${t.file}) is not provably tenant-scoped — missing ${missing.join(", ")}. ` +
          `Every new table carries tenant_id + RLS + a tenant-scoped policy family, OR is added to ` +
          `TENANCY_EXEMPT in scripts/check-migrations.mjs with a written reason (tenancy is OPERATING §4 always-high).`,
      );
    }
  }

  // 4. `true` predicates: legitimate only for SELECT on a non-tenant-scoped table.
  for (const t of model.tables.values()) {
    for (const p of t.policies) {
      for (const [kind, expr] of [["using", p.using], ["with check", p.withCheck]]) {
        if (expr !== "true") continue;
        if (kind === "using" && p.cmd === "select" && !t.hasTenantId) continue; // public reference data
        errors.push(
          `policy "${p.name}" on "${t.name}" (${p.file}) has \`${kind} (true)\` for command \`${p.cmd}\` — ` +
            (t.hasTenantId
              ? `"${t.name}" is tenant-scoped, so an unconditional predicate is a cross-tenant hole. Scope it to current_tenant_id().`
              : `a blanket \`true\` is only acceptable for \`for select\` (public reference data). Scope the write path.`),
        );
      }
    }
  }

  // 5. `security definer` functions must be revoked from anon + authenticated, or allowlisted.
  for (const f of model.definerFunctions.values()) {
    if (Object.prototype.hasOwnProperty.call(DEFINER_EXEMPT, f.name)) continue;
    // `public` alone is NOT enough: db-tests.yml re-grants EXECUTE explicitly to
    // anon/authenticated for hosted parity, so the revoke must name those roles.
    const need = ["anon", "authenticated"].filter((r) => !f.revokedFrom.has(r));
    if (need.length) {
      errors.push(
        `function "${f.name}" (${f.file}) is \`security definer\` — it runs as the owner and BYPASSES RLS — ` +
          `but is not revoked from ${need.join(", ")}. Add ` +
          `\`revoke all on function public.${f.name}(...) from public, anon, authenticated;\` ` +
          `(the 0002_vault_helpers.sql pattern), or add it to DEFINER_EXEMPT with a reason.`,
      );
    }
  }

  return errors;
}

// CLI entrypoint (only when run directly, not when imported).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2] || DEFAULT_DIR;
  const { ok, errors, files } = checkMigrations(dir);
  if (ok) {
    let tenancy = "";
    try {
      const { tables, definerFunctions } = parseMigrations(dir);
      const scoped = [...tables.values()].filter((t) => t.hasTenantId).length;
      tenancy =
        ` ${tables.size} table(s): ${scoped} tenant-scoped (tenant_id + RLS + policy), ` +
        `${tables.size - scoped} allowlisted; ${definerFunctions.size} security-definer function(s) gated.`;
    } catch {
      /* naming-only fixture dirs have no parseable SQL — that's fine */
    }
    console.log(
      `✅ migrations OK — ${files.length} file(s) in ${dir}, all versions unique (0031 grandfathered).${tenancy}`,
    );
    process.exit(0);
  }
  const unreadable = errors.length === 1 && errors[0].startsWith("cannot read");
  console.error(`❌ migration guard: ${errors.length} problem(s) in ${dir}:`);
  for (const e of errors) console.error(`   • ${e}`);
  process.exit(unreadable ? 2 : 1);
}
