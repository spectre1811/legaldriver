import Anthropic from "@anthropic-ai/sdk";
import { claudeCliJson, claudeCliEnabled } from "./claude-cli";

// Backend router for structured-JSON completions.
//   CLASSIFIER_BACKEND = auto (default) | api | cli | off
//   - api: Anthropic SDK with structured outputs (needs ANTHROPIC_API_KEY)
//   - cli: local Claude Code CLI (uses OAuth creds, no API key) — local/self-hosted
//   - auto: api if a key is present, else cli, else null
//   - off: disabled (everything routes to needs-review)
// Returns parsed JSON (unknown) or null. Callers validate against their schema.

const MODEL = process.env.DOC_CLASSIFY_MODEL ?? "claude-haiku-4-5";

let sdk: Anthropic | null = null;
function getSdk(): Anthropic {
  if (!sdk) sdk = new Anthropic();
  return sdk;
}

type Schema = Record<string, unknown>;
export type CompleteOpts = { model?: string; maxTokens?: number };

async function apiCompleteJson(prompt: string, schema: Schema, opts?: CompleteOpts): Promise<unknown | null> {
  try {
    const res = await getSdk().messages.create({
      model: opts?.model ?? MODEL,
      max_tokens: opts?.maxTokens ?? 1024,
      // structured outputs → schema-valid JSON
      output_config: { format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: prompt }],
    } as Anthropic.Messages.MessageCreateParamsNonStreaming);
    if (res.stop_reason === "refusal") return null;
    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return null;
    return JSON.parse(block.text);
  } catch {
    return null;
  }
}

async function cliCompleteJson(prompt: string, schema: Schema, opts?: CompleteOpts): Promise<unknown | null> {
  const augmented = `${prompt}\n\nReturn ONLY a JSON object conforming to this JSON Schema (no markdown, no prose):\n${JSON.stringify(schema)}`;
  const raw = await claudeCliJson(augmented, { model: opts?.model ?? MODEL });
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function classifierBackend(): "api" | "cli" | "off" {
  const want = process.env.CLASSIFIER_BACKEND ?? "auto";
  if (want === "off") return "off";
  if (want === "api") return "api";
  if (want === "cli") return claudeCliEnabled() ? "cli" : "off";
  // auto
  if (process.env.ANTHROPIC_API_KEY) return "api";
  return claudeCliEnabled() ? "cli" : "off";
}

export async function completeJson(prompt: string, schema: Schema, opts?: CompleteOpts): Promise<unknown | null> {
  const backend = classifierBackend();
  if (backend === "off") return null;
  if (backend === "api") return apiCompleteJson(prompt, schema, opts);
  return cliCompleteJson(prompt, schema, opts);
}
