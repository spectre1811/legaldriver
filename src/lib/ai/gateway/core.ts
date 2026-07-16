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
  /** Why the call failed, when it did. `"timeout"` when a provider hung past the
   *  HTTP budget so the UI can say so honestly instead of a generic failure. */
  error?: "timeout" | null;
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
  /** Real provider token counts when the backend reports them (WO-32); else absent → estimate. */
  usage?: { input: number; output: number } | null;
  /** The transport aborted this attempt on the HTTP timeout budget (WO-186 W1). */
  timedOut?: boolean;
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
  /** tokens/cost are estimated (~4 chars/token) vs read from the provider. */
  estimated: boolean;
}
export type TraceSink = (e: TraceEvent) => void;

// ── Response cache (WO-186 W1) ────────────────────────────────────────────────
// Exact-hash cache of a whole gateway answer, so a repeated identical request
// (batch re-run, retry, same doc + same shortlist) replays the stored result at
// ZERO provider cost instead of re-billing the model. Store is INJECTED (a plain
// Map/LRU in prod — no new infra) so the core stays pure & unit-testable. Keyspace
// is per-tenant; the key folds in a prompt-version so a prompt/route change busts
// every stale entry (bump PROMPT_VERSION when the prompt or route models change).
export const PROMPT_VERSION = "1";

export interface CachedEntry {
  output: unknown;
  citations: Citation[];
  model: string;
  backend: string;
  tokens: { input: number; output: number; total: number; estimated: boolean };
  outputChars: number;
}
export interface ResponseCache {
  get(rawKey: string): CachedEntry | undefined;
  set(rawKey: string, entry: CachedEntry): void;
}

// The cache identity: everything that changes the answer. When the caller declares
// `cacheKeyParts` we key on THOSE (its stable identity — e.g. a doc content-hash +
// shortlist version) instead of the full input; otherwise we exact-hash the input.
// Route-model signature is included so re-pointing a task at a different model can
// never serve an answer the old model produced.
export function buildCacheKey(req: AiGatewayRequest, route: Route): string {
  const routeSig = route.chain.map((c) => `${c.backend ?? "keyless"}:${c.model ?? ""}`).join(",");
  const identity = req.cacheKeyParts ? JSON.stringify(req.cacheKeyParts) : req.input;
  return `${PROMPT_VERSION}|${req.task}|${routeSig}|${req.tenantId}|${req.schema ? "json" : "text"}|${identity}`;
}

export interface RunDeps {
  exec: ExecFn;
  trace: TraceSink;
  routes: Record<AiTask, Route>;
  prices?: Record<string, { inPerM: number; outPerM: number }>;
  now: () => number;
  newId: () => string;
  /** Optional exact-hash response cache (WO-186 W1). Absent → caching off. */
  cache?: ResponseCache;
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

// Lightweight structured-output guard: in schema mode we require the parsed JSON
// to actually MATCH the schema's shape (object with its `required` keys present, or
// an array when the schema is an array) — not merely "parseable". This closes the
// hole where a wrong-but-parseable object was returned as ok:true. (Not full
// JSON-Schema validation — no AJV dep — but catches the real failure modes: wrong
// top-level type, missing required fields.)
export function validatesSchema(json: unknown, schema: Record<string, unknown>): boolean {
  if (json == null) return false;
  if ((schema as { type?: string }).type === "array") return Array.isArray(json);
  if (typeof json !== "object" || Array.isArray(json)) return false;
  const required = (schema as { required?: unknown }).required;
  if (Array.isArray(required)) {
    for (const k of required) if (!(k in (json as Record<string, unknown>))) return false;
  }
  return true;
}

// One trace-event shape, emitted on both the cache-hit and the served paths.
function traceEvent(
  req: AiGatewayRequest,
  route: Route,
  scopeKind: RetrievalScope["kind"],
  traceId: string,
  latencyMs: number,
  served: {
    backend: string;
    model: string;
    outputChars: number;
    tokens: { input: number; output: number; total: number; estimated: boolean };
    costUsd: number;
    cacheHit: boolean;
    ok: boolean;
  },
): TraceEvent {
  return {
    traceId,
    task: req.task,
    tenantId: req.tenantId,
    locale: req.locale ?? null,
    scopeKind,
    backend: served.backend,
    model: served.model,
    tier: route.tier,
    inputChars: req.input.length,
    outputChars: served.outputChars,
    tokens: { input: served.tokens.input, output: served.tokens.output, total: served.tokens.total },
    costUsd: served.costUsd,
    cacheHit: served.cacheHit,
    ok: served.ok,
    latencyMs,
    estimated: served.tokens.estimated,
  };
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

  // ── Response cache (WO-186 W1): a HIT replays the stored answer at zero provider
  // cost. Still traced (cacheHit=true, cost 0) so hit-rate + savings are visible.
  const cacheKey = deps.cache ? buildCacheKey(req, route) : null;
  if (deps.cache && cacheKey) {
    const hit = deps.cache.get(cacheKey);
    if (hit) {
      deps.trace(
        traceEvent(req, route, scope.kind, traceId, deps.now() - startedAt, {
          backend: hit.backend,
          model: hit.model,
          outputChars: hit.outputChars,
          tokens: hit.tokens,
          costUsd: 0,
          cacheHit: true,
          ok: true,
        }),
      );
      return {
        output: hit.output as T | null,
        citations: hit.citations,
        model: hit.model,
        backend: hit.backend,
        tokens: hit.tokens,
        cost: { usd: 0, estimated: hit.tokens.estimated },
        cacheHit: true,
        traceId,
        ok: true,
        error: null,
      };
    }
  }

  let text: string | null = null;
  let json: unknown | null = null;
  let usedBackend: OaiBackend | undefined;
  let usedModel: string | undefined;
  let usage: { input: number; output: number } | null = null;
  let anyTimeout = false;
  let ok = false;

  for (const choice of backendChain(route)) {
    const r = await deps.exec({
      backend: choice.backend,
      model: choice.model,
      maxTokens: route.maxTokens,
      prompt: req.input,
      schema: req.schema,
    });
    if (r.timedOut) anyTimeout = true;
    const success = req.schema
      ? r.json != null && validatesSchema(r.json, req.schema)
      : typeof r.text === "string" && r.text.trim().length > 0;
    if (success) {
      text = r.text;
      json = r.json;
      usedBackend = choice.backend;
      usedModel = choice.model;
      usage = r.usage ?? null;
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
  // Prefer the provider's REAL token counts (WO-32); fall back to the ~4-chars/token
  // estimate only when the backend didn't report usage (e.g. the keyless CLI path).
  const tokens = usage
    ? { input: usage.input, output: usage.output, total: usage.input + usage.output, estimated: false as const }
    : estimateTokens(req.input.length, outputChars);
  const model = usedModel ?? "(router-default)";
  const cost = estimateCostUsd(tokens, deps.prices?.[model]);
  const backend = usedBackend ?? "keyless-router";

  const result: AiGatewayResult<T> = {
    output,
    citations: [],
    model,
    backend,
    tokens,
    cost,
    cacheHit: false,
    traceId,
    ok,
    // Honest failure reason: a total failure whose last cause was a provider hang
    // surfaces as "timeout" so the UI boundary can say so rather than a generic error.
    error: ok ? null : anyTimeout ? "timeout" : null,
  };

  // Store only successful answers, keyed per-tenant. Misses/failures are never cached.
  if (deps.cache && cacheKey && ok) {
    deps.cache.set(cacheKey, { output, citations: [], model, backend, tokens, outputChars });
  }

  deps.trace(
    traceEvent(req, route, scope.kind, traceId, deps.now() - startedAt, {
      backend,
      model,
      outputChars,
      tokens,
      costUsd: cost.usd,
      cacheHit: false,
      ok,
    }),
  );

  return result;
}
