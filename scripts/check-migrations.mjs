// WO-41 · Migration-filename collision guard (zero-dependency, Node built-ins only).
//
// Why this exists: the sequential `NNNN_` migration scheme is collision-prone under the
// parallel multi-agent fleet. Two work orders each grabbed `0031_` (WO-29
// `0031_email_status_archive`, WO-30 `0031_profile_notification_prefs`) — both got applied,
// but two migrations sharing one version apply in an ambiguous order and a rebuild-from-
// migrations runs both under one number → repo↔DB drift. This guard makes that class of
// mistake fail CI instead of silently landing.
//
// What it checks in `supabase/migrations/`:
//   1. Naming shape: `<version>_<slug>.sql` (version = 4-digit legacy NNNN or 14-digit
//      Supabase timestamp; slug = lowercase a-z0-9, `_`-separated).
//   2. Version uniqueness: no two migrations may share a version (the real bug).
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

// KNOWN, ALREADY-APPLIED historical collision — grandfathered, NOT renamed. Both files are
// recorded in the live `supabase_migrations.schema_migrations`; renaming one would make
// Supabase treat it as new and re-run it (a founder-gated DB op). We accept the debt and
// bar it from growing. Do NOT add entries here — a new collision is a bug to fix, not to allow.
export const GRANDFATHERED = { "0031": 2 };

const DEFAULT_DIR = "supabase/migrations";
const NAME_RE = /^(\d{4}|\d{14})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;

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

  return { ok: errors.length === 0, errors, files };
}

// CLI entrypoint (only when run directly, not when imported).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2] || DEFAULT_DIR;
  const { ok, errors, files } = checkMigrations(dir);
  if (ok) {
    console.log(`✅ migrations OK — ${files.length} file(s) in ${dir}, all versions unique (0031 grandfathered).`);
    process.exit(0);
  }
  const unreadable = errors.length === 1 && errors[0].startsWith("cannot read");
  console.error(`❌ migration guard: ${errors.length} problem(s) in ${dir}:`);
  for (const e of errors) console.error(`   • ${e}`);
  process.exit(unreadable ? 2 : 1);
}
