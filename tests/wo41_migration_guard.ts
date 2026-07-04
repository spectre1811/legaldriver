// Test: migration-filename collision guard (WO-41). No live services, no secrets.
// Drives the real CLI (`node scripts/check-migrations.mjs <dir>`) against synthetic fixtures
// and the real supabase/migrations dir, asserting exit codes + messages. Runs the actual
// script the CI gate runs — so a regression in the guard is caught here.
// Run: npx tsx tests/wo41_migration_guard.ts
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = "scripts/check-migrations.mjs";

let ok = true;
const fail = (m: string) => {
  ok = false;
  console.log(`  ✗ ${m}`);
};

/** Run the guard CLI against `dir`; returns { code, err }. */
function run(dir: string): { code: number; err: string } {
  const r = spawnSync("node", [SCRIPT, dir], { encoding: "utf8" });
  return { code: r.status ?? 1, err: `${r.stdout || ""}${r.stderr || ""}` };
}

/** Build a temp migrations dir with the given filenames. */
function fixture(files: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "wo41-mig-"));
  for (const f of files) writeFileSync(join(dir, f), "-- test migration\n");
  return dir;
}

function withFixture(files: string[], fn: (dir: string) => void) {
  const dir = fixture(files);
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// 1. A clean set (legacy NNNN + a timestamped migration) passes.
withFixture(["0001_init.sql", "0002_foo_bar.sql", "20260705120000_baz.sql"], (d) => {
  if (run(d).code !== 0) fail("clean mixed-scheme set should pass");
});

// 2. A fresh duplicate version FAILS — the exact WO-29/WO-30 `0031` collision class.
withFixture(["0007_a.sql", "0007_b.sql"], (d) => {
  const { code, err } = run(d);
  if (code !== 1) fail(`duplicate version 0007 should exit 1, got ${code}`);
  if (!err.includes("0007")) fail("duplicate error must name the offending version");
});

// 3. Grandfathered 0031 allowed exactly twice; a THIRD fails (debt can't grow).
withFixture(["0031_a.sql", "0031_b.sql"], (d) => {
  if (run(d).code !== 0) fail("the grandfathered 0031 pair should pass");
});
withFixture(["0031_a.sql", "0031_b.sql", "0031_c.sql"], (d) => {
  if (run(d).code !== 1) fail("a THIRD 0031 must fail — grandfather is exactly 2");
});

// 4. Malformed names FAIL (missing version, uppercase, wrong shape).
withFixture(["0001_init.sql", "nope.sql"], (d) => {
  if (run(d).code !== 1) fail("a non-conforming filename should fail");
});
withFixture(["0001_Init.sql"], (d) => {
  if (run(d).code !== 1) fail("an uppercase slug should fail");
});
withFixture(["123_short.sql"], (d) => {
  if (run(d).code !== 1) fail("a 3-digit version should fail (must be 4-digit or 14-digit)");
});

// 5. The REAL migrations dir passes — the only dup (0031) is grandfathered, nothing new slipped in.
{
  const { code, err } = run("supabase/migrations");
  if (code !== 0) fail(`real supabase/migrations must pass: ${err.trim()}`);
}

console.log(ok ? "WO-41 MIGRATION GUARD: PASS" : "WO-41 MIGRATION GUARD: FAIL");
process.exit(ok ? 0 : 1);
