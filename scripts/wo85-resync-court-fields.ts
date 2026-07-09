/**
 * WO-85 · One-off resync of `matter.detail` for existing matters through the SHIPPED
 * `getCaseCached` + `upsertCase` path — NO ad-hoc SQL writes to `matter.detail`.
 *
 * Why: the WO-41/WO-69 court-record fields (filing no./date, registration date, district,
 * first-hearing) are extracted+persisted correctly at the source now, but a matter added or
 * synced BEFORE the box row carried them keeps a stale `detail` snapshot until it is re-synced.
 * The nightly cron (`/api/cron/refresh`) does exactly this but is capped to 600/run AND bounded
 * by Vercel's 60s function limit; this runs the identical read→upsert once across the whole
 * backlog with no time ceiling (reachable box `/v1` + Supabase from the operator box).
 *
 * Reuses the canonical path (no drift): `getCaseCached(cnr,{force:true})` (fast box DB read via
 * `/v1`) → `upsertCase(supabase, tenantId, case, clientId)`. Batched-by-progress, resumable
 * (skips matters that already carry `detail.filingNumber` unless `--all`), idempotent (upsertCase
 * is), tenant-scoped (upsertCase keys every write on tenant_id). A per-case timeout skips CNRs the
 * box has never ingested (those trigger a slow on-demand hop and are a SEPARATE ingest gap).
 *
 * Usage: npx tsx scripts/wo85-resync-court-fields.ts [--all] [--dry-run] [--limit N]
 *   env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LD_API_KEY, LD_API_BASE,
 *        COURT_DATA_PROVIDER=legaldriver
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getCaseCached } from "@/lib/court/gateway";
import { upsertCase } from "@/lib/court/sync";

const ALL = process.argv.includes("--all");
const DRY = process.argv.includes("--dry-run");
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;
const CASE_TIMEOUT_MS = 8000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timeout:${label}`)), ms)),
  ]);
}

async function main() {
  const supabase = createAdminClient();
  const { data: matters, error } = await supabase
    .from("matter")
    .select("id, cnr, tenant_id, client_id, detail")
    .is("deleted_at", null)
    .not("cnr", "is", null);
  if (error) throw error;

  const rows = (matters ?? []).filter((m) => m.cnr);
  const todo = (ALL
    ? rows
    : rows.filter((m) => ((m.detail ?? {}) as Record<string, unknown>).filingNumber == null)
  ).slice(0, LIMIT === Infinity ? undefined : LIMIT);

  console.log(`[wo85] matters=${rows.length} todo=${todo.length} all=${ALL} dry=${DRY} limit=${LIMIT}`);

  let synced = 0, boxMiss = 0, boxNoFiling = 0, failed = 0;
  for (let i = 0; i < todo.length; i++) {
    const m = todo[i];
    try {
      const r = await withTimeout(getCaseCached(m.cnr!, { force: true }), CASE_TIMEOUT_MS, m.cnr!);
      if (!r.case) { boxMiss++; continue; }
      if ((r.case.detail as Record<string, unknown> | undefined)?.filingNumber == null) boxNoFiling++;
      if (!DRY) await upsertCase(supabase, m.tenant_id, r.case, m.client_id);
      synced++;
    } catch {
      failed++; // not-in-box / slow on-demand hop / transient — skipped, separate ingest gap
    }
    if ((i + 1) % 25 === 0 || i + 1 === todo.length)
      console.log(`  ${i + 1}/${todo.length} synced=${synced} box-miss=${boxMiss} box-no-filing=${boxNoFiling} failed=${failed}`);
  }
  console.log(`[wo85] DONE synced=${synced} box-miss=${boxMiss} box-no-filing=${boxNoFiling} failed=${failed}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
