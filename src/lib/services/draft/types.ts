import type { Citation } from "../agent/types";

// A resolved drafting template (subset of the draft_template row the agent needs).
export interface DraftTemplate {
  id: string;
  title: string;
  produces_doc_type: string;
  jurisdiction: string | null;
  default_sections: string[];
  structure: { heading: string; guidance?: string; required_points?: string[] }[];
  conventions: string | null;
  language: string;
}

// The structured draft the LLM returns (provider-agnostic via completeJson).
export interface DraftResult {
  body: string;                // the draft prose (markdown)
  assumptions: string[];
  presumptions: string[];
  clarifications: string[];    // open questions the advocate must answer
  bullet_points: string[];     // operative points / checklist
  citations: Citation[];
}

export interface DraftGrounding {
  template: DraftTemplate;
  sections: string[];          // statutory sections being drafted under
  sourceText: string;          // the document being responded to (extracted/OCR'd)
  sourceLabel: string;         // filename / doc_type for the prompt header
  matter?: {
    title: string; cnr?: string | null; court?: string | null;
    parties?: string[]; stage?: string | null;
  } | null;
  references: { ref: string; title: string; summary: string }[];  // legal_reference (old↔new)
  deadlines: { jurisdiction: string; description: string; days: number }[];
  precedent: { ref: string; title: string; url?: string; snippet: string }[];
}
