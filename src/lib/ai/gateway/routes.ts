import type { AiTask, Route } from "./core";

// ROUTE TABLE — CONFIG, NOT CODE (04-AI §0). Change a task's model/provider HERE;
// feature code never names a provider. `backend` is the PREFERRED OpenAI-compatible
// provider — when its key is unconfigured, the transport degrades to the keyless
// router (local Claude CLI) or the Anthropic SDK (WO-02 decision B). The keyless
// path is always the implicit final fallback (see core.backendChain).
//
// Wave 1 wires ONLY `summary.case` to a call site; the other routes are ready for
// the Wave 2 feature migration (drafting, classify, agent).
export const ROUTES: Record<AiTask, Route> = {
  "summary.case": { tier: "cheap", maxTokens: 1024, backend: "litellm", fallback: ["deepseek"] },
  "classify.doc": { tier: "cheap", maxTokens: 1024, backend: "litellm", fallback: ["deepseek"] },
  "classify.message": { tier: "cheap", maxTokens: 512, backend: "litellm", fallback: ["deepseek"] },
  "classify.voice": { tier: "cheap", maxTokens: 512, backend: "litellm", fallback: ["deepseek"] },
  // Founder-fixed: DeepSeek for drafting (04-AI §0 example).
  "draft.document": { tier: "frontier", maxTokens: 3500, backend: "deepseek" },
  "agent.lawyer": { tier: "frontier", maxTokens: 1500, backend: "litellm" },
  "agent.reply": { tier: "cheap", maxTokens: 400, backend: "litellm", fallback: ["deepseek"] },
};

// Per-model unit prices, USD per 1M tokens — ILLUSTRATIVE estimates (04-AI §6);
// verify at contract time. Used only for the cost ESTIMATE in the trace until
// real provider usage is wired in Wave 3. Keyed by concrete model name; the
// keyless router default has no entry, so its estimated cost is 0.
export const PRICES: Record<string, { inPerM: number; outPerM: number }> = {
  "deepseek-v4-pro": { inPerM: 0.28, outPerM: 0.42 },
  "deepseek-chat": { inPerM: 0.28, outPerM: 0.42 },
  "claude-haiku-4-5": { inPerM: 1.0, outPerM: 5.0 },
};
