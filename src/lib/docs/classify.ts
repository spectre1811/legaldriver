import { completeJson } from "@/lib/ai/complete";

// doc-classify-claude: classify a document/email against the tenant's clients &
// matters, and extract key fields. Backend is pluggable (see lib/ai/complete.ts):
// the Anthropic API with structured outputs when ANTHROPIC_API_KEY is set, else
// the local Claude Code CLI (OAuth creds, no API key). Falls back to needs-review
// when neither is available.

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

export async function classifyDocument(input: ClassifyInput): Promise<Classification> {
  const fallback: Classification = {
    doc_type: "other",
    client_id: null,
    matter_id: null,
    confidence: 0,
    extracted: { parties: [], dates: [], amounts: [], cnrs: [] },
    summary: "Unclassified (no model / low confidence).",
  };

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

  const result = (await completeJson(prompt, SCHEMA)) as Partial<Classification> | null;
  if (!result || typeof result !== "object") return fallback;

  // Normalize + guard. ids must be from the provided lists (model can hallucinate).
  const clientIds = new Set(input.clients.map((c) => c.id));
  const matterIds = new Set(input.matters.map((m) => m.id));
  const ex = (result.extracted ?? {}) as Partial<Classification["extracted"]>;
  const parsed: Classification = {
    doc_type: result.doc_type ?? "other",
    client_id: result.client_id && clientIds.has(result.client_id) ? result.client_id : null,
    matter_id: result.matter_id && matterIds.has(result.matter_id) ? result.matter_id : null,
    confidence: typeof result.confidence === "number" ? Math.max(0, Math.min(1, result.confidence)) : 0,
    extracted: {
      parties: Array.isArray(ex.parties) ? ex.parties : [],
      dates: Array.isArray(ex.dates) ? ex.dates : [],
      amounts: Array.isArray(ex.amounts) ? ex.amounts : [],
      cnrs: Array.isArray(ex.cnrs) ? ex.cnrs : [],
    },
    summary: result.summary ?? "",
  };
  return parsed;
}
