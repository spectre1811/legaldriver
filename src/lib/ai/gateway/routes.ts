import type { AiTask, Route } from "./core";

// ROUTE TABLE — CONFIG, NOT CODE (04-AI §0). Change a task's provider/model HERE;
// feature code never names a provider. Each route is an ordered `chain` of backend
// choices tried until one answers; the chain ends at a keyless choice (Claude
// api/cli) so local dev and Vercel work with zero infra (WO-02 decision B). Model
// names are per-backend — a DeepSeek model name is meaningless to the keyless
// Claude path — so the keyless-quality models (Sonnet for drafting/agent) are set
// explicitly on their keyless choice, preserving pre-gateway behaviour.
//
// LiteLLM model names ("cheap"/"frontier") map to providers in the proxy config
// (scripts/litellm.config.yaml). Omitting `model` uses that backend's env default
// (DEEPSEEK_MODEL for deepseek; DOC_CLASSIFY_MODEL=Haiku for the keyless router).
const KEYLESS_QUALITY = "claude-sonnet-4-6"; // drafting/agent quality-sensitive default

export const ROUTES: Record<AiTask, Route> = {
  "summary.case": {
    tier: "cheap",
    maxTokens: 1024,
    chain: [{ backend: "litellm", model: "cheap" }, { backend: "deepseek" }, {}],
  },
  "classify.doc": {
    tier: "cheap",
    maxTokens: 1024,
    chain: [{ backend: "litellm", model: "cheap" }, { backend: "deepseek" }, {}],
  },
  "classify.message": {
    tier: "cheap",
    maxTokens: 512,
    chain: [{ backend: "litellm", model: "cheap" }, { backend: "deepseek" }, {}],
  },
  "classify.voice": {
    tier: "cheap",
    maxTokens: 512,
    chain: [{ backend: "litellm", model: "cheap" }, { backend: "deepseek" }, {}],
  },
  // Founder-fixed: DeepSeek for drafting (04-AI §0). Keyless fallback stays Sonnet
  // (quality-sensitive), matching the pre-gateway DRAFT_MODEL default.
  "draft.document": {
    tier: "frontier",
    maxTokens: 3500,
    chain: [{ backend: "deepseek" }, { model: KEYLESS_QUALITY }],
  },
  // Lawyer agent — frontier reasoning. Keyless fallback = Sonnet (was AGENT_MODEL).
  "agent.lawyer": {
    tier: "frontier",
    maxTokens: 1500,
    chain: [{ backend: "litellm", model: "frontier" }, { model: KEYLESS_QUALITY }],
  },
  // Client-bot reply draft — cheap + strict RAG (no open-ended generation).
  "agent.reply": {
    tier: "cheap",
    maxTokens: 400,
    chain: [{ backend: "litellm", model: "cheap" }, { backend: "deepseek" }, {}],
  },
};

// Per-model unit prices, USD per 1M tokens — ILLUSTRATIVE estimates (04-AI §6);
// verify at contract time. Used only for the trace cost ESTIMATE until real
// provider usage is wired in Wave 3. Keyed by served model name.
export const PRICES: Record<string, { inPerM: number; outPerM: number }> = {
  cheap: { inPerM: 0.28, outPerM: 0.42 }, // LiteLLM "cheap" → DeepSeek-class
  frontier: { inPerM: 3.0, outPerM: 15.0 }, // LiteLLM "frontier" → Sonnet-class
  "deepseek-v4-pro": { inPerM: 0.28, outPerM: 0.42 },
  "deepseek-chat": { inPerM: 0.28, outPerM: 0.42 },
  "claude-sonnet-4-6": { inPerM: 3.0, outPerM: 15.0 },
  "claude-haiku-4-5": { inPerM: 1.0, outPerM: 5.0 },
};
