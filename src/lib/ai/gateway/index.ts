import { randomUUID } from "node:crypto";
import { completeJson, completeText, type Backend } from "@/lib/ai/complete";
import { runCore } from "./core";
import type { AiGatewayRequest, AiGatewayResult, ExecFn, TraceSink } from "./core";
import { ROUTES, PRICES } from "./routes";
import { defaultTraceSink } from "./trace";
import { supabaseMeterSink } from "./meter";

// The single AI gateway seam (04-AI §0, ADR-AI1). Product code calls
// `aiGateway.run({ task, ... })` and never touches a provider SDK. This file is the
// thin wiring: it binds the pure gateway core (core.ts) to the existing
// provider-agnostic transport (complete.ts) and the trace sink.

// Bridge core's ExecCall to complete.ts. The gateway's OaiBackend union is
// structurally identical to complete's Backend, so it passes through directly; if
// that backend's key is unconfigured, complete.ts degrades to the keyless router.
const completeExec: ExecFn = async ({ backend, model, maxTokens, prompt, schema }) => {
  // Capture the provider's real token usage (WO-32) so the gateway meters actual, not estimated.
  let usage: { input: number; output: number } | null = null;
  const opts: { backend?: Backend; model?: string; maxTokens: number; onUsage: (u: { input: number; output: number }) => void } =
    { backend, model, maxTokens, onUsage: (u) => { usage = u; } };
  if (schema) return { json: await completeJson(prompt, schema, opts), text: null, usage };
  return { text: await completeText(prompt, opts), json: null, usage };
};

// Trace (jsonLog + optional Langfuse) AND the per-tenant metering ledger.
const base = defaultTraceSink();
const sink: TraceSink = (e) => {
  base(e);
  supabaseMeterSink(e);
};

export const aiGateway = {
  run<T = unknown>(req: AiGatewayRequest): Promise<AiGatewayResult<T>> {
    return runCore<T>(req, {
      exec: completeExec,
      trace: sink,
      routes: ROUTES,
      prices: PRICES,
      now: () => Date.now(),
      newId: () => randomUUID(),
    });
  },
};

export type { AiGatewayRequest, AiGatewayResult, RetrievalScope, AiTask } from "./core";
