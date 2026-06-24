import Anthropic from "@anthropic-ai/sdk";

// doc-classify-claude: classify a document/email against the tenant's clients &
// matters, and extract key fields. Uses the Anthropic Node SDK with structured
// outputs (output_config.format) so the model returns schema-valid JSON — no
// brittle prompt-only "return JSON" parsing. Model defaults to Haiku 4.5
// (cheap, fast, classification-grade; supports structured outputs), overridable.

// Per-doc classification is mechanical → Haiku by the operator's model-routing policy.
const MODEL = process.env.DOC_CLASSIFY_MODEL ?? "claude-haiku-4-5";

export interface ClassifyInput {
  filename?: string;
  docTextOrSnippet: string; // extracted text (truncated) or email snippet/subject
  clients: { id: string; name: string }[]; // tenant shortlist
  matters: { id: string; title: string; cnr?: string | null }[];
}

export interface Classification {
  doc_type: string;
  client_id: string | null;
  matter_id: string | null;
  confidence: number; // 0..1
  extracted: { parties: string[]; dates: string[]; amounts: string[]; cnrs: string[] };
  summary: string;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    doc_type: { type: "string", description: "e.g. court_order, notice, agreement, invoice, correspondence, other" },
    client_id: { type: ["string", "null"], description: "best-match client id from the provided list, or null" },
    matter_id: { type: ["string", "null"], description: "best-match matter id from the provided list, or null" },
    confidence: { type: "number", description: "0..1 confidence in the client/matter match" },
    extracted: {
      type: "object",
      additionalProperties: false,
      properties: {
        parties: { type: "array", items: { type: "string" } },
        dates: { type: "array", items: { type: "string" } },
        amounts: { type: "array", items: { type: "string" } },
        cnrs: { type: "array", items: { type: "string" } },
      },
      required: ["parties", "dates", "amounts", "cnrs"],
    },
    summary: { type: "string", description: "one-sentence summary" },
  },
  required: ["doc_type", "client_id", "matter_id", "confidence", "extracted", "summary"],
} as const;

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic();
  return client;
}

export async function classifyDocument(input: ClassifyInput): Promise<Classification> {
  const fallback: Classification = {
    doc_type: "other",
    client_id: null,
    matter_id: null,
    confidence: 0,
    extracted: { parties: [], dates: [], amounts: [], cnrs: [] },
    summary: "Unclassified (no model / low confidence).",
  };

  const anthropic = getClient();
  if (!anthropic) return fallback;

  const clientList = input.clients.map((c) => `- ${c.id}: ${c.name}`).join("\n") || "(none)";
  const matterList =
    input.matters.map((m) => `- ${m.id}: ${m.title}${m.cnr ? ` [CNR ${m.cnr}]` : ""}`).join("\n") || "(none)";

  const prompt = `You are a legal document classifier for an advocate's practice. Classify the document and extract key fields. Match it to at most one client and one matter from the lists; if no good match, use null and a low confidence. Do not invent ids — only use ids from the lists.

CLIENTS:
${clientList}

MATTERS:
${matterList}

DOCUMENT (filename: ${input.filename ?? "n/a"}):
"""
${input.docTextOrSnippet.slice(0, 12000)}
"""`;

  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: prompt }],
    });
    if (res.stop_reason === "refusal") return fallback;
    const textBlock = res.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return fallback;
    const parsed = JSON.parse(textBlock.text) as Classification;

    // Guard: ids must be from the provided lists (model can still hallucinate).
    const clientIds = new Set(input.clients.map((c) => c.id));
    const matterIds = new Set(input.matters.map((m) => m.id));
    if (parsed.client_id && !clientIds.has(parsed.client_id)) parsed.client_id = null;
    if (parsed.matter_id && !matterIds.has(parsed.matter_id)) parsed.matter_id = null;
    return parsed;
  } catch {
    return fallback;
  }
}
