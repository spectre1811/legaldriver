import type { Classification } from "./classify-core";

// Rebuild a Classification from a prior document row of identical content (the content-hash
// classification cache — WO-33). Reuses the content-intrinsic EXTRACTION (type, parties, CNRs,
// summary, is_legal); the client/matter MATCH is deliberately left null — it's context-dependent and
// re-decided per this upload. Pure (no server-only / IO) so it's unit-testable.
export function classificationFromCache(row: { doc_type: string | null; category: string | null; extracted: unknown }): Classification {
  const ex = (row.extracted ?? {}) as Record<string, unknown>;
  const arr = (k: string): string[] => (Array.isArray(ex[k]) ? (ex[k] as string[]) : []);
  return {
    doc_type: row.doc_type ?? "other",
    category: row.category ?? "other",
    client_id: null,
    matter_id: null,
    confidence: typeof ex.confidence === "number" ? (ex.confidence as number) : 0.5,
    extracted: { parties: arr("parties"), dates: arr("dates"), amounts: arr("amounts"), cnrs: arr("cnrs") },
    summary: typeof ex.summary === "string" ? (ex.summary as string) : "",
    is_legal: ex.isLegal !== false,
    suggested_client_name: typeof ex.suggestedClientName === "string" ? (ex.suggestedClientName as string) : null,
    suggested_matter_title: typeof ex.suggestedMatterTitle === "string" ? (ex.suggestedMatterTitle as string) : null,
  };
}
