import { randomUUID } from "node:crypto";
import { completeJson, completeText, type Backend } from "@/lib/ai/complete";
import { runCore } from "./core";
import type { AiGatewayRequest, AiGatewayResult, ExecFn } from "./core";
import { ROUTES, PRICES } from "./routes";
import { defaultTraceSink } from "./trace";

// The single AI gateway seam (04-AI §0, ADR-AI1). Product code calls
// `aiGateway.run({ task, ... })` and never touches a provider SDK. This file is the
// thin wiring: it binds the pure gateway core (core.ts) to the existing
// provider-agnostic transport (complete.ts) and the trace sink.

// Bridge core's ExecCall to complete.ts. The gateway's OaiBackend union is
// structurally identical to complete's Backend, so it passes through directly; if
// that backend's key is unconfigured, complete.ts degrades to the keyless router.
const completeExec: ExecFn = async ({ backend, model, maxTokens, prompt, schema }) => {
  const opts: { backend?: Backend; model?: string; maxTokens: number } = { backend, model, maxTokens };
  if (schema) return { json: await completeJson(prompt, schema, opts), text: null };
  return { text: await completeText(prompt, opts), json: null };
};

const sink = defaultTraceSink();

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
