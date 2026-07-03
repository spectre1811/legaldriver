import type { TraceSink } from "./core";
import { createAdminClient } from "@/lib/supabase/admin";

// Per-tenant AI usage ledger (WO-02 metering). Writes one `ai_usage_event` row per
// gateway call so `/dashboard/ai-usage` shows real cost/token data. Metadata only
// (no prompt/response bodies — same discipline as the trace). Fire-and-forget via
// the service-role client, keyed by tenant_id; a failed write NEVER breaks the
// request path.
export const supabaseMeterSink: TraceSink = (e) => {
  try {
    const supabase = createAdminClient();
    void supabase
      .from("ai_usage_event")
      .insert({
        tenant_id: e.tenantId,
        task: e.task,
        backend: e.backend,
        model: e.model,
        tier: e.tier,
        tokens_in: e.tokens.input,
        tokens_out: e.tokens.output,
        cost_usd: e.costUsd,
        cache_hit: e.cacheHit,
        estimated: e.estimated,
        ok: e.ok,
        trace_id: e.traceId,
      })
      .then(({ error }: { error: { message: string } | null }) => {
        if (error) console.warn(`[ai-gateway:meter] ai_usage_event insert failed: ${error.message}`);
      });
  } catch {
    /* metering must never break the request path */
  }
};
