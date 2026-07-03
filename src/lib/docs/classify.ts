import { aiGateway } from "@/lib/ai/gateway";
import {
  buildClassifyPrompt,
  CLASSIFY_SCHEMA,
  FALLBACK,
  normalizeClassification,
  type ClassifyInput,
  type Classification,
} from "./classify-core";

// doc-classify-claude: classify a document/email against the tenant's clients &
// matters, and extract key fields. Routes through the AI gateway (04-AI §0) — the
// route table picks the model (cheap tier; keyless Claude CLI fallback). Falls back
// to needs-review when no backend answers. Prompt + schema live in classify-core
// (shared with the self-hosted worker).

export type { ClassifyInput, Classification };

const SYSTEM_TENANT = "system"; // defensive default; every real caller passes a tenantId

export async function classifyDocument(input: ClassifyInput): Promise<Classification> {
  const { output } = await aiGateway.run({
    task: "classify.doc",
    input: buildClassifyPrompt(input),
    schema: CLASSIFY_SCHEMA as unknown as Record<string, unknown>,
    tenantId: input.tenantId ?? SYSTEM_TENANT,
    scope: { kind: "tenant", tenantId: input.tenantId ?? SYSTEM_TENANT },
  });
  if (!output) return FALLBACK;
  return normalizeClassification(output, input);
}
