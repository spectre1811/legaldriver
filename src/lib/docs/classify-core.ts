// Pure classification core (prompt + schema + normalization) with NO path-alias
// or app-only imports, so it can be reused by both the in-app classifier
// (src/lib/docs/classify.ts) and the standalone self-hosted worker
// (scripts/classify-worker.ts). One source of truth for the prompt + schema.

export interface ClassifyInput {
  filename?: string;
  docTextOrSnippet: string;
  clients: { id: string; name: string }[];
  matters: { id: string; title: string; cnr?: string | null }[];
  /** Owning tenant — passed to the AI gateway for metering/trace scoping. */
  tenantId?: string;
}

import { categoryOf, DOC_TYPES } from "./categories";

export interface Classification {
  doc_type: string;
  category: string; // derived canonical category (categoryOf(doc_type))
  client_id: string | null;
  matter_id: string | null;
  confidence: number;
  extracted: { parties: string[]; dates: string[]; amounts: string[]; cnrs: string[] };
  summary: string;
  // Auto-create signals: only act on these when is_legal is true.
  is_legal: boolean;
  suggested_client_name: string | null;
  suggested_matter_title: string | null;
}

export const FALLBACK: Classification = {
  doc_type: "other",
  category: "other",
  client_id: null,
  matter_id: null,
  confidence: 0,
  extracted: { parties: [], dates: [], amounts: [], cnrs: [] },
  summary: "Unclassified (no model / low confidence).",
  is_legal: false,
  suggested_client_name: null,
  suggested_matter_title: null,
};

export const CLASSIFY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    doc_type: { type: "string", enum: DOC_TYPES as unknown as string[], description: "the single best document type from the controlled list" },
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
    is_legal: { type: "boolean", description: "true only if this is a genuine legal/court/client matter (not a newsletter, OTP, marketing, personal mail)" },
    suggested_client_name: { type: ["string", "null"], description: "if no client matches but this is a legal doc, the client/party name to create, else null" },
    suggested_matter_title: { type: ["string", "null"], description: "if no matter matches but this is a legal doc, a short case title to create, else null" },
  },
  required: ["doc_type", "client_id", "matter_id", "confidence", "extracted", "summary", "is_legal", "suggested_client_name", "suggested_matter_title"],
} as const;

export function buildClassifyPrompt(input: ClassifyInput): string {
  const clientList = input.clients.map((c) => `- ${c.id}: ${c.name}`).join("\n") || "(none)";
  const matterList =
    input.matters.map((m) => `- ${m.id}: ${m.title}${m.cnr ? ` [CNR ${m.cnr}]` : ""}`).join("\n") || "(none)";
  return `You are a legal document classifier for an advocate's practice. Classify the document and extract key fields. Match it to at most one client and one matter from the lists; if no good match, set the id to null. Do not invent ids — only use ids from the lists.

Pick doc_type as the SINGLE best fit from this controlled list (use "other" only if none fit): ${DOC_TYPES.join(", ")}.

Set is_legal=true ONLY for genuine legal/court/client matters (court orders, notices, pleadings, agreements, case correspondence, invoices to/from clients). Set is_legal=false for newsletters, marketing, OTPs, security alerts, social, and personal mail.
When is_legal=true AND no existing client matches, put the client/party name in suggested_client_name (else null). When is_legal=true AND no existing matter matches, put a short case title in suggested_matter_title (else null). Always list any CNR numbers found in extracted.cnrs.

NULL-CONTRACT — only report what the document actually states. Do NOT infer, guess, or fabricate: if a field is not present in the document, return null (for ids and suggested_* names) or an empty array (for extracted.parties/dates/amounts/cnrs). Every value in extracted must appear verbatim in the text above — never a paraphrase, a normalised form, or a plausible default. When in doubt, leave it out: a missing field is corrected downstream, an invented one mis-files the document.

CLIENTS:
${clientList}

MATTERS:
${matterList}

DOCUMENT (filename: ${input.filename ?? "n/a"}):
"""
${input.docTextOrSnippet.slice(0, 12000)}
"""`;
}

// Normalize raw model JSON into a Classification, guarding hallucinated ids.
export function normalizeClassification(result: unknown, input: ClassifyInput): Classification {
  if (!result || typeof result !== "object") return FALLBACK;
  const r = result as Partial<Classification>;
  const clientIds = new Set(input.clients.map((c) => c.id));
  const matterIds = new Set(input.matters.map((m) => m.id));
  const ex = (r.extracted ?? {}) as Partial<Classification["extracted"]>;
  const docType = r.doc_type ?? "other";
  return {
    doc_type: docType,
    category: categoryOf(docType, input.filename),
    client_id: r.client_id && clientIds.has(r.client_id) ? r.client_id : null,
    matter_id: r.matter_id && matterIds.has(r.matter_id) ? r.matter_id : null,
    confidence: typeof r.confidence === "number" ? Math.max(0, Math.min(1, r.confidence)) : 0,
    extracted: {
      parties: Array.isArray(ex.parties) ? ex.parties : [],
      dates: Array.isArray(ex.dates) ? ex.dates : [],
      amounts: Array.isArray(ex.amounts) ? ex.amounts : [],
      cnrs: Array.isArray(ex.cnrs) ? ex.cnrs : [],
    },
    summary: r.summary ?? "",
    is_legal: r.is_legal === true,
    suggested_client_name: typeof r.suggested_client_name === "string" && r.suggested_client_name.trim() ? r.suggested_client_name.trim() : null,
    suggested_matter_title: typeof r.suggested_matter_title === "string" && r.suggested_matter_title.trim() ? r.suggested_matter_title.trim() : null,
  };
}
