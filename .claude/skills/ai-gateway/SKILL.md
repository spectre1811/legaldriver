---
name: ai-gateway
description: >-
  How to call any AI model in legaldriver — always through the one aiGateway seam,
  never a provider SDK. Use when adding/changing an AI feature (summary, drafting,
  classify, agent, bot), routing a task to a different model/provider, or wiring
  caching/tracing/budgets. Covers the frozen caller contract, the config route
  table, the keyless-default fallback, and the scope/PII guardrails.
---

# AI Gateway skill

**Rule (04-AI §0, ADR-AI1): no product code calls an LLM/embedding/STT/OCR provider
SDK directly. Every AI call goes through `aiGateway.run(...)`.** This is what makes
providers swappable by config and gives caching/budgets/multilingual/evals/traces once.

## Call it

```ts
import { aiGateway } from "@/lib/ai/gateway";

const res = await aiGateway.run({
  task: "summary.case",              // the ONLY provider-facing choice you make
  input: prompt,                     // string
  schema: MY_SCHEMA as unknown as Record<string, unknown>, // omit for prose
  locale,                            // optional; default from user profile
  tenantId,                          // for metering + trace scoping
  scope: { kind: "tenant", tenantId }, // computed from the SESSION before the call
});
const parsed = normalize(res.output); // res.output is null on failure → keep your fallback
```

Returns `{ output, citations, model, backend, tokens, cost, cacheHit, traceId, ok }`.
`output` is the parsed JSON (schema mode) or text (prose mode), or `null` if every
backend failed — handle `null` exactly like the old `completeJson` null (e.g. queue it).

## Route a task to a different model/provider

Edit **config only** — `src/lib/ai/gateway/routes.ts`:
```ts
"draft.document": { tier: "frontier", maxTokens: 3500, backend: "deepseek" },
```
`backend` is the PREFERRED OpenAI-compatible provider (`litellm` | `deepseek` |
`custom`). If its key is unset, the transport **degrades to the keyless router** (local
Claude CLI). The chain always ends in keyless, so local/Vercel works with no infra.
Add a new `task` to the `AiTask` union in `core.ts` + a row in `ROUTES` (a test asserts
every task resolves).

## Guardrails (do not break)

- **Scope**: always compute `scope` from the authenticated session BEFORE the call and
  pass it in. The gateway never derives or widens scope from `input`/model output
  (04-AI §3.2). For a client bot: `{ kind: "client-matter", matterIds }`.
- **No PII in traces**: the trace records metadata only (char counts, tokens, model) —
  never raw prompts/responses. Don't add content to `TraceEvent`.
- **Citations** for legal statements travel in `res.citations`.

## Local backends (optional)

```
docker compose -f docker-compose.ai.yml up -d      # LiteLLM :4000 + Langfuse :3001
# .env: LITELLM_BASE_URL=http://localhost:4000/v1  LITELLM_API_KEY=$LITELLM_MASTER_KEY
#       LANGFUSE_HOST=http://localhost:3001  LANGFUSE_PUBLIC_KEY=…  LANGFUSE_SECRET_KEY=…
```
Unset → keyless CLI + stdout-only traces. Production `ai-proxy` deploy is founder-gated.

## Files
`src/lib/ai/gateway/{core,routes,trace,index}.ts` · transport `src/lib/ai/complete.ts`
· tests `tests/ai_gateway.ts` · decision `docs/decisions/2026-07-03-ai-gateway.md`.
