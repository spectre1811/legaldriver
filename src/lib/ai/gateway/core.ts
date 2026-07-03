// AI GATEWAY — the one seam every AI call in the product goes through (04-AI §0,
// ADR-AI1). Feature code names a `task`; the gateway maps it to a provider/model
// via config (routes.ts), applies fallback, and emits a metadata-only trace.
//
// This module is PURE: no `@/` imports, no provider SDKs, no I/O. All effects
// (provider calls, tracing, clock, ids) are injected as `RunDeps` so the routing,
// fallback, and scope-guard logic is unit-testable without network or CLI. The
// wiring to the real transport lives in `index.ts`.

// ── Task taxonomy — the ONLY vocabulary feature code uses ─────────────────────
export type AiTask =
  | "summary.case"
  | "draft.document"
  | "classify.doc"
  | "classify.message"
  | "classify.voice"
  | "agent.lawyer"
  | "agent.reply";

export const AI_TASKS: AiTask[] = [
  "summary.case",
  "draft.document",
  "classify.doc",
  "classify.message",
  "classify.voice",
  "agent.lawyer",
  "agent.reply",
];

// OpenAI-compatible backends the gateway can request explicitly. When the chosen
// backend's key is unconfigured, the transport (complete.ts) transparently
// degrades to the keyless router (local Claude CLI) or the Anthropic SDK — this
// is WO-02 decision B: LiteLLM/DeepSeek are backends BEHIND the seam, and keyless
// stays the default locally/on Vercel when no proxy is set.
export type OaiBackend = "deepseek" | "custom" | "litellm";
export type Tier = "cheap" | "frontier" | "vision";

// One candidate in a route's fallback chain. `model` is backend-specific (a
// DeepSeek model name means nothing to the keyless Claude path), so each candidate
// carries its own — this is why the chain holds choices, not a single model.
export interface BackendChoice {
  /** OpenAI-compatible backend; `undefined` = the keyless router (Claude api/cli). */
  backend?: OaiBackend;
  /** Model name FOR THIS backend (omit → that backend's configured default). */
  model?: string;
}

export interface Route {
  tier: Tier;
  maxTokens: number;
  /** Tried in order until one yields output; should end at a keyless choice so the
   *  local/Vercel path always terminates the chain (backendChain enforces this). */
  chain: BackendChoice[];
}

// Retrieval scope is computed from the AUTHENTICATED SESSION before the call
// (04-AI §3.2). The gateway carries it verbatim and NEVER derives, widens, or
// accepts scope from `input` or model output.
export interface RetrievalScope {
  kind: "tenant" | "public" | "client-matter";
  tenantId?: string;
  matterIds?: string[];
}

export interface Citation {
  source: string;
  ref?: string;
}

export interface AiGatewayRequest {
  task: AiTask;
  input: string;
  /** Present → structured JSON mode (validated by the caller). Absent → prose. */
  schema?: Record<string, unknown>;
  /** Default resolved from the user profile by the caller; plumbed here. */
  locale?: string;
  tenantId: string;
  scope: RetrievalScope;
  cacheKeyParts?: (string | number)[];
  budgetTier?: "free" | "basic" | "pro" | "enterprise";
}

export interface AiGatewayResult<T = unknown> {
  output: T | null;
  citations: Citation[];
  /** The routed model name (or "(router-default)" when the keyless router picks). */
  model: string;
  /** The routed/requested backend label (served-backend fidelity lands in Wave 3). */
  backend: string;
  tokens: { input: number; output: number; total: number; estimated: boolean };
  cost: { usd: number; estimated: boolean };
  cacheHit: boolean;
  traceId: string;
  ok: boolean;
}

// ── Transport injection ───────────────────────────────────────────────────────
export interface ExecCall {
  backend?: OaiBackend;
  model?: string;
  maxTokens: number;
  prompt: string;
  schema?: Record<string, unknown>;
}
export interface ExecResult {
  text: string | null;
  json: unknown | null;
}
export type ExecFn = (call: ExecCall) => Promise<ExecResult>;

// ── Trace event — METADATA ONLY. No raw prompt/response content ever (no PII in
// traces, 04-AI §0.6 / CLAUDE.md §4). Only char counts + routing metadata. ──────
export interface TraceEvent {
  traceId: string;
  task: AiTask;
  tenantId: string;
  locale: string | null;
  scopeKind: RetrievalScope["kind"];
  backend: string;
  model: string;
  tier: Tier;
  inputChars: number;
  outputChars: number;
  tokens: { input: number; output: number; total: number };
  costUsd: number;
  cacheHit: boolean;
  ok: boolean;
  latencyMs: number;
}
export type TraceSink = (e: TraceEvent) => void;

export interface RunDeps {
  exec: ExecFn;
  trace: TraceSink;
  routes: Record<AiTask, Route>;
  prices?: Record<string, { inPerM: number; outPerM: number }>;
  now: () => number;
  newId: () => string;
}

// ── Pure helpers ────────────────────────────────────────────────────────────
export function resolveRoute(task: AiTask, table: Record<AiTask, Route>): Route {
  const r = table[task];
  if (!r) throw new Error(`aiGateway: no route configured for task "${task}"`);
  return r;
}

// The ordered candidate list, guaranteed to end in a keyless choice (backend
// undefined) so the local/Vercel keyless path always terminates the chain.
export function backendChain(route: Route): BackendChoice[] {
  const hasKeyless = route.chain.some((c) => c.backend === undefined);
  return hasKeyless ? route.chain : [...route.chain, {}];
}

export function estimateTokens(promptChars: number, outputChars: number) {
  // Rough ~4 chars/token heuristic. Real usage from the provider lands in Wave 3.
  const input = Math.ceil(promptChars / 4);
  const output = Math.ceil(outputChars / 4);
  return { input, output, total: input + output, estimated: true as const };
}

export function estimateCostUsd(
  tokens: { input: number; output: number },
  price?: { inPerM: number; outPerM: number },
) {
  if (!price) return { usd: 0, estimated: true as const };
  const usd = (tokens.input / 1e6) * price.inPerM + (tokens.output / 1e6) * price.outPerM;
  return { usd: Number(usd.toFixed(6)), estimated: true as const };
}

// ── The gateway core ─────────────────────────────────────────────────────────
export async function runCore<T = unknown>(
  req: AiGatewayRequest,
  deps: RunDeps,
): Promise<AiGatewayResult<T>> {
  const traceId = deps.newId();
  const startedAt = deps.now();
  const route = resolveRoute(req.task, deps.routes);

  // GUARDRAIL (04-AI §3.2): scope is frozen and used ONLY for trace/observability
  // here — never to build a query and never widened. Retrieval (Wave 2+) reads
  // this same caller-supplied scope; the gateway has no path to derive it from
  // `input` or model output.
  const scope = Object.freeze({ ...req.scope });

  let text: string | null = null;
  let json: unknown | null = null;
  let usedBackend: OaiBackend | undefined;
  let usedModel: string | undefined;
  let ok = false;

  for (const choice of backendChain(route)) {
    const r = await deps.exec({
      backend: choice.backend,
      model: choice.model,
      maxTokens: route.maxTokens,
      prompt: req.input,
      schema: req.schema,
    });
    const success = req.schema
      ? r.json != null
      : typeof r.text === "string" && r.text.trim().length > 0;
    if (success) {
      text = r.text;
      json = r.json;
      usedBackend = choice.backend;
      usedModel = choice.model;
      ok = true;
      break;
    }
  }

  const output = (req.schema ? json : text) as T | null;
  const outputChars = req.schema
    ? json != null
      ? JSON.stringify(json).length
      : 0
    : text?.length ?? 0;
  const tokens = estimateTokens(req.input.length, outputChars);
  const model = usedModel ?? "(router-default)";
  const cost = estimateCostUsd(tokens, deps.prices?.[model]);

  const result: AiGatewayResult<T> = {
    output,
    citations: [],
    model,
    backend: usedBackend ?? "keyless-router",
    tokens,
    // cacheHit is always false in Wave 1 — the response cache is Wave 3.
    cost,
    cacheHit: false,
    traceId,
    ok,
  };

  deps.trace({
    traceId,
    task: req.task,
    tenantId: req.tenantId,
    locale: req.locale ?? null,
    scopeKind: scope.kind,
    backend: result.backend,
    model,
    tier: route.tier,
    inputChars: req.input.length,
    outputChars,
    tokens: { input: tokens.input, output: tokens.output, total: tokens.total },
    costUsd: cost.usd,
    cacheHit: false,
    ok,
    latencyMs: deps.now() - startedAt,
  });

  return result;
}
