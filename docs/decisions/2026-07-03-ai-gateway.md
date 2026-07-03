# AI Gateway — the one seam every AI call goes through (ADR-AI1 realized)

- **Date:** 2026-07-03
- **Status:** Accepted (Waves 1–2 merged; Wave 3 metering landed) · interface frozen with founder (WO-02)
- **Work order:** WO-02 · **Plan refs:** 04-AI §0, §4.5, §5, §9; 12-CLOUD ADR-C8
- **Supersedes/extends:** the ad-hoc `src/lib/ai/complete.ts` transport (kept as a backend)

## Context

Every AI feature must be able to swap providers by config (DeepSeek for drafting, a
frontier model for agents, a cheap model for classification) without touching feature
code, and caching/budgets/multilingual/evals/provenance must be implemented once. The
repo already had a provider-agnostic transport (`complete.ts`: anthropic-api / local
Claude CLI / deepseek / custom-OpenAI-compatible / off) and a strong operator
preference for keyless, on-box, zero-marginal-cost inference (local Claude CLI; no paid
key by default) with a Vercel deploy target.

04-AI §0 mandates a self-hosted **LiteLLM proxy + Langfuse** (`ai-proxy` service). That
must be reconciled with the repo's keyless-in-process reality.

## Decision

1. **The `aiGateway` client seam is the product-wide contract; LiteLLM is a swappable
   backend BEHIND it, not a hard dependency** (founder decision B, 2026-07-03). Because
   `complete.ts` already speaks OpenAI-compatible HTTP, LiteLLM is added as one more
   backend (`LITELLM_BASE_URL`/`LITELLM_API_KEY`). When no proxy/key is configured, the
   gateway **degrades to the keyless router** (local Claude CLI) — so local dev and
   Vercel keep working with zero infra.

2. **Frozen caller contract** (founder-approved, treat as an API):
   ```
   aiGateway.run({ task, input, schema?, locale?, tenantId, scope, cacheKeyParts?, budgetTier? })
     → { output, citations, model, backend, tokens, cost, cacheHit, traceId, ok }
   ```
   `task` is the ONLY provider-facing thing feature code names.

3. **Route table = config, not code** (`src/lib/ai/gateway/routes.ts`): `task →
   { tier, maxTokens, chain: BackendChoice[] }`, where each `BackendChoice` is
   `{ backend?, model? }` tried in order until one answers. **Model names are
   per-backend** (a DeepSeek model name is meaningless to the keyless Claude path), so
   the chain holds choices rather than one shared model; the keyless-quality model
   (Sonnet for drafting/agent) is set on its own keyless choice, preserving
   pre-gateway behaviour. Initial map: summaries/classify → cheap (LiteLLM→DeepSeek
   →keyless-Haiku); `draft.document` → DeepSeek→keyless-Sonnet (founder-fixed);
   `agent.lawyer` → LiteLLM-frontier→keyless-Sonnet.

4. **Fallback chain always terminates in the keyless router**, guaranteeing a working
   local/Vercel path even when every configured provider fails.

5. **Guardrails baked into the seam:**
   - Retrieval **scope is caller-supplied, computed from the session before the call,
     frozen, and never derived/widened from `input` or model output** (04-AI §3.2).
   - **Traces carry metadata only** (task, model, tokens, cost, latency, cacheHit) —
     never raw prompt/response content (no PII, 04-AI §0.6 / CLAUDE.md §4).
   - Langfuse via `fetch` ingestion (no SDK dep), fire-and-forget, never blocks the
     request path.

6. **Local infra** via `docker-compose.ai.yml` (LiteLLM + Langfuse + its Postgres) +
   `scripts/litellm.config.yaml`. The **production Fargate deploy of `ai-proxy` stays
   founder-gated infra** and is applied separately.

## Architecture

```
feature code ── aiGateway.run({task, ...}) ──▶ gateway core (pure: route + fallback + scope-guard + trace)
                                                     │
                                                     ▼  ExecFn (injected)
                                   complete.ts transport ──▶ LiteLLM proxy ──▶ providers
                                        └─ degrades to ──▶ keyless: local Claude CLI / Anthropic SDK
```

- `src/lib/ai/gateway/core.ts` — pure, effect-injected, unit-tested (no `@/` imports).
- `src/lib/ai/gateway/routes.ts` — the config route + price tables.
- `src/lib/ai/gateway/trace.ts` — JSON-log sink (always) + optional Langfuse sink.
- `src/lib/ai/gateway/index.ts` — wires the transport + trace sink; exports `aiGateway`.

## Consequences

- **Wave 1:** `summary.case` routed through the gateway with identical behavior (null →
  existing background-worker queue path preserved). No provider SDK called directly in
  that path. Migrations: none. Auth/billing/RLS: untouched.
- **Wave 2 (done):** all remaining AI features routed through the gateway —
  `draft.document`, `classify.doc`/`classify.message`/`classify.voice`, `agent.lawyer`,
  `agent.reply`, plus the background worker's case-summary + email-classify loops.
  `tenantId`+`scope` are threaded from each caller's session (drafting/agent = `tenant`;
  the client bot = `client-matter`, i.e. that client's own matters only, 04-AI §3.5).
  Per-backend model selection moved out of feature code into the route table. **No
  feature calls `completeJson`/`completeText` or a provider SDK directly anymore**
  (grep-clean; only the transport + gateway do). Migrations/auth/billing/RLS: untouched.
- **Wave 3 (metering) — landed:** migration `0028_ai_usage_event` adds a per-tenant
  usage ledger (deny-by-default RLS 4-policy; `ai_usage_monthly` rollup view with
  `security_invoker=true` so it respects RLS) + regenerated `database.types.ts`.
  The transport (`complete.ts`) now returns **real provider token usage + served
  model** (OAI + Anthropic paths); the gateway records real tokens/cost and marks
  `estimated=false` (keyless CLI reports no counts → estimate). A metering sink
  (`meter.ts`) writes one `ai_usage_event` per call via the service-role client
  (best-effort, never blocks the request; explicit tenant_id). **Soft-warn only**
  (`AI_SOFT_WARN_USD_PER_MONTH`) — HARD budget caps are deferred to WO-04 because no
  tenant tier source / billing exists yet (not inventing a throwaway tier system).
  Cost panel at `/dashboard/ai-usage` (RLS-scoped). Cross-tenant isolation proven on
  the live DB (`tests/rls_isolation.ts` now covers `ai_usage_event`). Migration was
  founder-approved and applied via the Management API (additive/expand-only).
- **Remaining (later waves):** exact-hash + provider prompt cache (`cacheHit` still
  false); Wave 4 orchestration seam (AI-SDK vs LangGraph.js); Wave 5 multilingual.
- **Known Wave-1 limitations (partly resolved in Wave 3):** tokens/cost were ESTIMATES
  (~4 chars/token + illustrative price table); `cacheHit` is always `false` (no cache
  yet); the trace `backend` label is the *routed/requested* backend, so when a request
  degrades to keyless the label still reads the requested backend until real
  served-model/usage is threaded through the transport.
