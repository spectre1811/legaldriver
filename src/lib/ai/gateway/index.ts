import { randomUUID } from "node:crypto";
import { completeJson, completeText, type Backend } from "@/lib/ai/complete";
import { runCore } from "./core";
import type { AiGatewayRequest, AiGatewayResult, ExecFn } from "./core";
import { ROUTES, PRICES } from "./routes";
import { defaultTraceSink } from "./trace";
import { meterSink } from "./meter";
import type { TraceSink } from "./core";

// The single AI gateway seam (04-AI §0, ADR-AI1). Product code calls
// `aiGateway.run({ task, ... })` and never touches a provider SDK. This file is the
// thin wiring: it binds the pure gateway core (core.ts) to the existing
// provider-agnostic transport (complete.ts) and the trace sink.

// Bridge core's ExecCall to complete.ts. The gateway's OaiBackend union is
// structurally identical to complete's Backend, so it passes through directly; if
// that backend's key is unconfigured, complete.ts degrades to the keyless router.
const completeExec: ExecFn = async ({ backend, model, maxTokens, prompt, schema }) => {
  const opts: { backend?: Backend; model?: string; maxTokens: number } = { backend, model, maxTokens };
  if (schema) {
    const r = await completeJson(prompt, schema, opts);
    return { json: r.value, text: null, usage: r.usage, model: r.model };
  }
  const r = await completeText(prompt, opts);
  return { text: r.value, json: null, usage: r.usage, model: r.model };
};

// Every gateway call fans out to: stdout/Langfuse trace + per-tenant metering
// ledger. Both are best-effort and never block the request.
const trace = defaultTraceSink();
const meter = meterSink();
const sink: TraceSink = (e) => {
  trace(e);
  meter(e);
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
