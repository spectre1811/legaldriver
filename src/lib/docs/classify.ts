import { completeJson } from "@/lib/ai/complete";
import {
  buildClassifyPrompt,
  CLASSIFY_SCHEMA,
  FALLBACK,
  normalizeClassification,
  type ClassifyInput,
  type Classification,
} from "./classify-core";

// doc-classify-claude: classify a document/email against the tenant's clients &
// matters, and extract key fields. Backend is pluggable (see lib/ai/complete.ts):
// the Anthropic API with structured outputs when ANTHROPIC_API_KEY is set, else
// the local Claude Code CLI (OAuth creds, no API key). Falls back to needs-review
// when neither is available. Prompt + schema live in classify-core (shared with
// the self-hosted worker).

export type { ClassifyInput, Classification };

export async function classifyDocument(input: ClassifyInput): Promise<Classification> {
  const result = await completeJson(buildClassifyPrompt(input), CLASSIFY_SCHEMA as unknown as Record<string, unknown>);
  if (!result) return FALLBACK;
  return normalizeClassification(result, input);
}
