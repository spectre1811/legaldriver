// Pure filing decision (WO-27) — NO I/O, no `server-only`, so it's unit-testable (the WO-15 lesson:
// test the contract, not the transport). Given a classifier result + an optional explicit context,
// decides where a document files and whether we're confident enough to file vs. send to triage.
//
// Rule: an explicit context (a case/client upload) always wins — the human chose it. Otherwise we
// file only to an EXISTING high-confidence match; a weak/absent match goes to "needs_review". We
// never create a new client/matter here (suggest, don't force).

export function decideFiling(
  cls: { confidence: number; client_id: string | null; matter_id: string | null },
  context?: { clientId?: string | null; matterId?: string | null },
): { clientId: string | null; matterId: string | null; status: "filed" | "needs_review" } {
  const hasContext = Boolean(context?.clientId || context?.matterId);
  // STRUCTURAL confidence (WO-33 W3 · research §5): the model's self-reported `confidence` is poorly
  // calibrated (often anti-correlated with correctness), so we DON'T gate on it. The trustworthy
  // signal is whether the classifier matched a CONCRETE existing record — `client_id`/`matter_id` are
  // ids from the provided shortlist, i.e. real clients/cases. A real match auto-files even at a modest
  // self-confidence; a high self-confidence with no match does NOT (it goes to review).
  const hasMatch = Boolean(cls.client_id || cls.matter_id);
  const clientId = context?.clientId ?? (hasMatch ? cls.client_id : null);
  const matterId = context?.matterId ?? (hasMatch ? cls.matter_id : null);
  const status: "filed" | "needs_review" = hasContext || hasMatch ? "filed" : "needs_review";
  return { clientId, matterId, status };
}
