import type { TraceEvent, TraceSink } from "./core";

// Trace sinks for the AI gateway. Every sink receives METADATA ONLY (char counts +
// routing info) — raw prompts/responses are never traced (no PII, 04-AI §0.6).

// Structured JSON line to stdout — the always-on baseline (feeds the cost/anomaly
// dashboard via log ingestion; Wave 3 adds per-tenant metering on top).
export const jsonLogSink: TraceSink = (e) => {
  try {
    console.log(`[ai-gateway] ${JSON.stringify(e)}`);
  } catch {
    /* never let tracing break the request path */
  }
};

interface LangfuseCfg {
  host: string;
  publicKey: string;
  secretKey: string;
}

function langfuseCfgFromEnv(): LangfuseCfg | null {
  const host = process.env.LANGFUSE_HOST;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  if (!host || !publicKey || !secretKey) return null;
  return { host: host.replace(/\/$/, ""), publicKey, secretKey };
}

// Best-effort Langfuse trace via the public ingestion API — fire-and-forget, never
// awaited in the request path, never throws. Uses only `fetch` (no SDK dependency).
function langfuseSink(cfg: LangfuseCfg): TraceSink {
  const auth = Buffer.from(`${cfg.publicKey}:${cfg.secretKey}`).toString("base64");
  return (e) => {
    const body = {
      batch: [
        {
          id: `${e.traceId}-gen`,
          type: "generation-create",
          timestamp: new Date().toISOString(),
          body: {
            id: e.traceId,
            traceId: e.traceId,
            name: e.task,
            model: e.model,
            usage: {
              input: e.tokens.input,
              output: e.tokens.output,
              total: e.tokens.total,
              unit: "TOKENS",
            },
            metadata: {
              backend: e.backend,
              tier: e.tier,
              tenantId: e.tenantId,
              locale: e.locale,
              scopeKind: e.scopeKind,
              cacheHit: e.cacheHit,
              ok: e.ok,
              latencyMs: e.latencyMs,
              costUsd: e.costUsd,
            },
          },
        },
      ],
    };
    void fetch(`${cfg.host}/api/public/ingestion`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {
      /* best-effort; a dropped trace must never affect the user request */
    });
  };
}

// The sink used by the running gateway: always JSON-log; additionally ship to
// Langfuse when LANGFUSE_* env is configured (local via docker-compose.ai.yml, or
// the staging/prod proxy).
export function defaultTraceSink(): TraceSink {
  const cfg = langfuseCfgFromEnv();
  if (!cfg) return jsonLogSink;
  const lf = langfuseSink(cfg);
  return (e) => {
    jsonLogSink(e);
    lf(e);
  };
}
