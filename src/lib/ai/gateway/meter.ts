import { createAdminClient } from "@/lib/supabase/admin";
import type { TraceEvent, TraceSink } from "./core";

// Per-tenant token metering (04-AI §5). Persists one ai_usage_event per gateway
// call, then optionally soft-warns when a tenant's month-to-date cost crosses a
// threshold. HARD caps are deliberately NOT here — tiers/billing are WO-04; this
// wave meters + warns only. Writes via the service-role admin client with an
// explicit tenant_id (RLS-bypass → scope by hand, CLAUDE.md §1). COUNTS only, no PII.

const SOFT_WARN_USD = Number(process.env.AI_SOFT_WARN_USD_PER_MONTH ?? "") || 0; // 0 = off

let cached: ReturnType<typeof createAdminClient> | null = null;
function admin() {
  return (cached ??= createAdminClient());
}

// Fire-and-forget sink: a metering failure NEVER affects the user's AI request.
export function meterSink(): TraceSink {
  return (e) => {
    void writeUsage(e).catch(() => {
      /* best-effort — metering must not break AI calls */
    });
  };
}

async function writeUsage(e: TraceEvent): Promise<void> {
  // Skip the defensive "system" sentinel (classify with no session tenant).
  if (!e.tenantId || e.tenantId === "system") return;
  const sb = admin();
  await sb.from("ai_usage_event").insert({
    tenant_id: e.tenantId,
    task: e.task,
    model: e.model,
    backend: e.backend,
    tier: e.tier,
    tokens_in: e.tokens.input,
    tokens_out: e.tokens.output,
    cost_usd: e.costUsd,
    cache_hit: e.cacheHit,
    ok: e.ok,
    estimated: e.estimated,
    trace_id: e.traceId,
  });
  if (SOFT_WARN_USD > 0) await softWarn(sb, e.tenantId);
}

function currentMonthStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

async function softWarn(sb: ReturnType<typeof createAdminClient>, tenantId: string): Promise<void> {
  // Month-to-date only: filter to the CURRENT month so a tenant idle this month
  // isn't warned on a stale prior-month total.
  const { data } = await sb
    .from("ai_usage_monthly")
    .select("cost_usd, month")
    .eq("tenant_id", tenantId)
    .gte("month", currentMonthStartIso());
  const mtd = (data ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
  if (mtd >= SOFT_WARN_USD) {
    console.warn(
      `[ai-gateway] soft-warn: tenant ${tenantId} month-to-date AI cost $${mtd.toFixed(2)} ≥ threshold $${SOFT_WARN_USD} (no hard cap — tiers/billing = WO-04)`,
    );
  }
}
