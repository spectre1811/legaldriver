// Lawyer Agent (Phase 3 · E6) — shared types. The agent RETRIEVES grounding from
// the tenant's matter corpus + the global legal knowledge pack, then ANSWERS with
// citations. It is assistive: every answer is a suggestion the advocate verifies.

export type CitationSource = "matter" | "document" | "hearing" | "order" | "legal_reference" | "judgment";

export interface RetrievalHit {
  source: CitationSource;
  ref: string; // human-facing reference: CNR, filename, or "IPC 420 → BNS 318"
  title: string;
  snippet: string;
  url?: string; // internal deep-link, e.g. /dashboard/cases/<id>
  matterId?: string;
}

export interface Citation {
  n: number; // bracket number used in the answer text
  source: CitationSource;
  ref: string;
  title: string;
  url?: string;
}

export interface AgentAnswer {
  answer: string;
  citations: Citation[];
  abstained: boolean;
  pending?: boolean; // queued to the self-hosted worker for synthesis (keyless prod)
}

export interface AskInput {
  tenantId: string;
  question: string;
  matterId?: string | null;
  clientId?: string | null;
  userId?: string | null;
  threadId?: string | null;
}
