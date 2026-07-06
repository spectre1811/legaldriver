// WO-54 W1 · Normalized `matter.tier` column. Guards:
//   (1) normalizeTier() maps the platform's raw tokens to the closed vocabulary, null for unknown;
//   (2) upsertCase writes the normalized tier (kept fresh, no drift);
//   (3) the migration's SQL backfill mirrors normalizeTier() (same map in two languages — the drift risk).
//
// Run: npx tsx tests/wo54_tier.ts

import { readFileSync, readdirSync } from "node:fs";
import { normalizeTier } from "../src/lib/court/tier";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed++;
}

// ── 1. normalizeTier ─────────────────────────────────────────────────────────
ok("HIGH → HC (the actual prod value)", normalizeTier("HIGH") === "HC");
ok("HC → HC", normalizeTier("HC") === "HC");
ok("'High Court of Gujarat' → HC", normalizeTier("High Court of Gujarat") === "HC");
ok("DISTRICT → DISTRICT (prod value)", normalizeTier("DISTRICT") === "DISTRICT");
ok("'District & Sessions Court' → DISTRICT", normalizeTier("District & Sessions Court") === "DISTRICT");
ok("'Sessions Court' → DISTRICT", normalizeTier("Sessions Court") === "DISTRICT");
ok("SUPREME COURT → SC", normalizeTier("Supreme Court of India") === "SC");
ok("TRIBUNAL → TRIBUNAL", normalizeTier("Some Tribunal") === "TRIBUNAL");
ok("CAT → TRIBUNAL", normalizeTier("CAT") === "TRIBUNAL");
ok("whitespace trimmed", normalizeTier("  high  ") === "HC");
ok("empty → null", normalizeTier("") === null);
ok("unknown → null (no fabricated tier)", normalizeTier("XYZ") === null);
ok("null → null", normalizeTier(null) === null);
ok("non-string → null", normalizeTier(123) === null);

// ── 2. upsertCase writes the normalized tier ─────────────────────────────────
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const sync = src("src/lib/court/sync.ts");
ok("upsertCase imports normalizeTier", /from "\.\/tier"/.test(sync) && /normalizeTier/.test(sync));
ok("upsertCase sets tier on the matter row", /tier:\s*normalizeTier\(/.test(sync));

const types = src("src/lib/db/database.types.ts");
ok("matter type has the tier column", /tier:\s*string\s*\|\s*null/.test(types));

// ── 3. migration exists + its backfill mirrors normalizeTier ─────────────────
const migDir = new URL("../supabase/migrations/", import.meta.url);
const mig = readdirSync(migDir).find((f) => /_wo54_matter_tier\.sql$/.test(f));
ok("WO-54 tier migration file exists", !!mig);
if (mig) {
  const sql = readFileSync(new URL(mig, migDir), "utf8");
  ok("migration adds the column (additive, IF NOT EXISTS)", /add column if not exists tier text/i.test(sql));
  ok("migration is idempotent (where tier is null)", /where\s+detail is not null and tier is null/i.test(sql));
  ok("migration creates the partial index", /create index if not exists matter_tier_idx/i.test(sql));
  // Mirror check: every target enum + the key raw tokens the normalizer maps must appear in the SQL CASE.
  ok("backfill maps HIGH% → HC", /like 'HIGH%'[\s\S]*?then 'HC'/i.test(sql));
  ok("backfill maps DISTRICT% → DISTRICT", /like 'DISTRICT%'[\s\S]*?then 'DISTRICT'/i.test(sql));
  ok("backfill maps SUPREME% → SC", /like 'SUPREME%'[\s\S]*?then 'SC'/i.test(sql));
  ok("backfill maps TRIBUNAL → TRIBUNAL", /like '%TRIBUNAL%'[\s\S]*?then 'TRIBUNAL'/i.test(sql));
}

console.log(failed === 0 ? "\nPASS" : `\nFAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
