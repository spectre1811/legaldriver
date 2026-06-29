import Anthropic from "@anthropic-ai/sdk";
import { claudeCliJson, claudeCliText, claudeCliEnabled } from "./claude-cli";

// Provider-agnostic completion layer. The app never hard-codes a vendor: pick one
// per-call (opts.backend) or globally via env (LLM_PROVIDER), and any OpenAI-compatible
// endpoint plugs in via LLM_BASE_URL / LLM_API_KEY / LLM_MODEL.
//   Backends: "anthropic-api" (SDK) · "cli" (local Claude Code, keyless) ·
//             "deepseek" (preset OpenAI-compatible) · "custom" (any OpenAI-compatible) · "off"
// completeJson → schema-valid JSON; completeText → prose (drafting, summaries).

const MODEL = process.env.DOC_CLASSIFY_MODEL ?? "claude-haiku-4-5";

let sdk: Anthropic | null = null;
const getSdk = (): Anthropic => (sdk ??= new Anthropic());

type Schema = Record<string, unknown>;
export type Backend = "deepseek" | "custom";
export type CompleteOpts = { model?: string; maxTokens?: number; backend?: Backend };

// ── OpenAI-compatible (DeepSeek / OpenAI / Together / Groq / Ollama / vLLM / …) ──
interface OaiCfg { baseUrl: string; apiKey: string; model: string }

function deepseekCfg(model?: string): OaiCfg | null {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  return { baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com", apiKey, model: model ?? process.env.DEEPSEEK_MODEL ?? "deepseek-v4-pro" };
}
function customCfg(model?: string): OaiCfg | null {
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL;
  if (!apiKey || !baseUrl) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey, model: model ?? process.env.LLM_MODEL ?? "gpt-4o-mini" };
}
function cfgFor(backend: Backend | undefined, model?: string): OaiCfg | null {
  if (backend === "custom") return customCfg(model);
  if (backend === "deepseek") return deepseekCfg(model);
  return null;
}
// Global default backend when a call doesn't specify one (env-driven agnosticism).
function defaultBackend(): Backend | undefined {
  const p = (process.env.LLM_PROVIDER ?? "").toLowerCase();
  if (p === "custom" || p === "openai") return "custom";
  if (p === "deepseek") return "deepseek";
  return undefined;
}

async function oaiChat(cfg: OaiCfg, prompt: string, opts?: { json?: boolean; maxTokens?: number; system?: string }): Promise<string | null> {
  try {
    const messages: { role: string; content: string }[] = [];
    if (opts?.system) messages.push({ role: "system", content: opts.system });
    messages.push({ role: "user", content: prompt });
    const body: Record<string, unknown> = { model: cfg.model, messages, max_tokens: opts?.maxTokens ?? 1500, stream: false };
    if (opts?.json) body.response_format = { type: "json_object" };
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === "string" ? content : null;
  } catch {
    return null;
  }
}
async function oaiCompleteJson(cfg: OaiCfg, prompt: string, schema: Schema, opts?: CompleteOpts): Promise<unknown | null> {
  const augmented = `${prompt}\n\nReturn ONLY a JSON object conforming to this JSON Schema (no markdown, no prose):\n${JSON.stringify(schema)}`;
  const txt = await oaiChat(cfg, augmented, { json: true, maxTokens: opts?.maxTokens ?? 1500 });
  if (!txt) return null;
  try { return JSON.parse(txt); } catch { return null; }
}

// ── Anthropic + CLI ──
async function apiCompleteJson(prompt: string, schema: Schema, opts?: CompleteOpts): Promise<unknown | null> {
  try {
    const res = await getSdk().messages.create({
      model: opts?.model ?? MODEL,
      max_tokens: opts?.maxTokens ?? 1024,
      output_config: { format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: prompt }],
    } as Anthropic.Messages.MessageCreateParamsNonStreaming);
    if (res.stop_reason === "refusal") return null;
    const block = res.content.find((b) => b.type === "text");
    return block && block.type === "text" ? JSON.parse(block.text) : null;
  } catch { return null; }
}
async function apiCompleteText(prompt: string, opts?: CompleteOpts): Promise<string | null> {
  try {
    const res = await getSdk().messages.create({
      model: opts?.model ?? MODEL,
      max_tokens: opts?.maxTokens ?? 2000,
      messages: [{ role: "user", content: prompt }],
    } as Anthropic.Messages.MessageCreateParamsNonStreaming);
    if (res.stop_reason === "refusal") return null;
    const block = res.content.find((b) => b.type === "text");
    return block && block.type === "text" ? block.text : null;
  } catch { return null; }
}
async function cliCompleteJson(prompt: string, schema: Schema, opts?: CompleteOpts): Promise<unknown | null> {
  const augmented = `${prompt}\n\nReturn ONLY a JSON object conforming to this JSON Schema (no markdown, no prose):\n${JSON.stringify(schema)}`;
  const raw = await claudeCliJson(augmented, { model: opts?.model ?? MODEL });
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function classifierBackend(): "api" | "cli" | "off" {
  const want = process.env.CLASSIFIER_BACKEND ?? "auto";
  if (want === "off") return "off";
  if (want === "api") return "api";
  if (want === "cli") return claudeCliEnabled() ? "cli" : "off";
  if (process.env.ANTHROPIC_API_KEY) return "api";
  return claudeCliEnabled() ? "cli" : "off";
}

// Structured JSON completion (validated by the caller against `schema`).
export async function completeJson(prompt: string, schema: Schema, opts?: CompleteOpts): Promise<unknown | null> {
  const backend = opts?.backend ?? defaultBackend();
  if (backend) { const cfg = cfgFor(backend, opts?.model); if (cfg) return oaiCompleteJson(cfg, prompt, schema, opts); }
  const router = classifierBackend();
  if (router === "off") return null;
  if (router === "api") return apiCompleteJson(prompt, schema, opts);
  return cliCompleteJson(prompt, schema, opts);
}

// Prose / long-form completion (drafting, summaries). Returns text or null.
export async function completeText(prompt: string, opts?: CompleteOpts): Promise<string | null> {
  const backend = opts?.backend ?? defaultBackend();
  if (backend) { const cfg = cfgFor(backend, opts?.model); if (cfg) return oaiChat(cfg, prompt, { maxTokens: opts?.maxTokens ?? 2000 }); }
  const router = classifierBackend();
  if (router === "off") return null;
  if (router === "api") return apiCompleteText(prompt, opts);
  return claudeCliText(prompt, { model: opts?.model, timeoutMs: opts?.maxTokens && opts.maxTokens > 2000 ? 240_000 : 180_000 });
}
