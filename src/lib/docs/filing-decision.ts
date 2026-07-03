// Pure filing decision (WO-27) — NO I/O, no `server-only`, so it's unit-testable (the WO-15 lesson:
// test the contract, not the transport). Given a classifier result + an optional explicit context,
// decides where a document files and whether we're confident enough to file vs. send to triage.
//
// Rule: an explicit context (a case/client upload) always wins — the human chose it. Otherwise we
// file only to an EXISTING high-confidence match; a weak/absent match goes to "needs_review". We
// never create a new client/matter here (suggest, don't force).

export const FILE_CONFIDENCE = 0.75;

export function decideFiling(
  cls: { confidence: number; client_id: string | null; matter_id: string | null },
  context?: { clientId?: string | null; matterId?: string | null },
): { clientId: string | null; matterId: string | null; status: "filed" | "needs_review" } {
  const hasContext = Boolean(context?.clientId || context?.matterId);
  const highConf = cls.confidence >= FILE_CONFIDENCE;
  const clientId = context?.clientId ?? (highConf ? cls.client_id : null);
  const matterId = context?.matterId ?? (highConf ? cls.matter_id : null);
  const status: "filed" | "needs_review" =
    hasContext || (highConf && (cls.client_id || cls.matter_id)) ? "filed" : "needs_review";
  return { clientId, matterId, status };
}
