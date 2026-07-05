// Shared AI case-summary core (pure — no path-alias/app imports) so it can be used
// by the in-app action and the self-hosted worker. Produces a thorough, structured
// briefing grounded only in the case record.

export interface CaseSummaryInput {
  title: string;
  cnr?: string | null;
  court?: string | null;
  caseType?: string | null;
  stage?: string | null;
  status?: string | null;
  nextHearingDate?: string | null;
  parties: { name?: string; side?: string; advocate?: string }[];
  hearings: { date: string; purpose?: string | null; judge?: string | null }[];
  documents: { filename?: string | null; doc_type?: string | null; parsed_text?: string | null }[];
}

export interface CaseSummary {
  summary: string;
  posture: string;
  key_points: string[];
  next_steps: string[];
  risk_flags: string[];
  arguments: string[];
  what_to_present: string[];
  /** The specific record items this briefing was grounded in (hearings, orders, docs). */
  sources: string[];
  /** Model self-assessed confidence 0-1 that the briefing is well-grounded in the record —
   *  NOT a prediction of the case outcome. Low when the record is thin, ambiguous, or stale. */
  confidence: number;
  /** Derived from confidence: below the threshold the briefing is routed to a review state
   *  (shown with a low-confidence banner, never as settled fact). Stored so the app and the
   *  worker render the same verdict. */
  review?: boolean;
  generated_at?: string;
}

// Below this confidence the briefing is routed to a review state (low-confidence banner, muted
// treatment, never presented as fact — AI-quality bar: cite-or-abstain / "LLM infers, code verifies").
export const CASE_SUMMARY_REVIEW_THRESHOLD = 0.6;

export type ConfidenceBand = "high" | "medium" | "low";

/** Bucket a 0-1 confidence for display. `low` is exactly the review band. */
export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 0.8) return "high";
  if (confidence >= CASE_SUMMARY_REVIEW_THRESHOLD) return "medium";
  return "low";
}

export const FALLBACK: CaseSummary = {
  summary: "",
  posture: "",
  key_points: [],
  next_steps: [],
  risk_flags: [],
  arguments: [],
  what_to_present: [],
  sources: [],
  confidence: 0,
  review: true,
};

export const CASE_SUMMARY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string", description: "3-5 sentence plain-language overview: what the case is about, the relief sought, and what has happened so far" },
    posture: { type: "string", description: "1-2 sentences on the current procedural posture — what the stage means and what happens next procedurally" },
    key_points: { type: "array", items: { type: "string" }, description: "the salient facts, issues, parties/representation, amounts and dates drawn from the record" },
    next_steps: { type: "array", items: { type: "string" }, description: "concrete, prioritised actions for the advocate, most urgent first; reference specific filings/documents to prepare" },
    risk_flags: { type: "array", items: { type: "string" }, description: "deadlines, limitation/statutory-compliance risks, missing documents or data, and stale-record warnings; empty if genuinely none" },
    arguments: { type: "array", items: { type: "string" }, description: "the legal arguments to advance for this client AND the likely arguments from the other side to anticipate/rebut — grounded in the record + well-settled law; each as a crisp point" },
    what_to_present: { type: "array", items: { type: "string" }, description: "what to actually present/submit at the next hearing — specific documents, submissions, authorities to cite, and the prayer/relief to seek; empty if not enough on record" },
    sources: { type: "array", items: { type: "string" }, description: "the SPECIFIC record items this briefing was grounded in — e.g. 'Hearing 2024-03-12: arguments', 'Order dated 2024-01-05', 'Doc: demand-notice.pdf'. So the advocate can verify each claim against the record." },
    confidence: { type: "number", minimum: 0, maximum: 1, description: "your HONEST self-assessment 0-1 that this briefing is well-grounded in the record and free of unsupported inference — NOT a prediction of who wins. Score LOW (<0.6) when the record is thin, missing key documents/orders, ambiguous, or stale (so a human reviews before relying); HIGH (>=0.8) only when hearings/orders/documents richly support every point. Calibrate down when in doubt." },
  },
  required: ["summary", "posture", "key_points", "next_steps", "risk_flags", "arguments", "what_to_present", "confidence"],
} as const;

export function buildCaseSummaryPrompt(c: CaseSummaryInput): string {
  const parties = c.parties.map((p) => `- ${p.name ?? "?"}${p.side ? ` (${p.side})` : ""}${p.advocate ? ` — adv. ${p.advocate}` : ""}`).join("\n") || "(none on record)";
  const hearings = c.hearings.slice(0, 15).map((h) => `- ${h.date}: ${h.purpose ?? "hearing"}${h.judge ? ` before ${h.judge}` : ""}`).join("\n") || "(none on record)";
  const docs = c.documents.slice(0, 10).map((d) => `- ${d.filename ?? "document"} (${d.doc_type ?? "?"})${d.parsed_text ? `: ${d.parsed_text.slice(0, 800)}` : ""}`).join("\n") || "(none)";

  return `You are an experienced Indian advocate's research associate. Produce a thorough, practical case briefing for the advocate handling this matter. Be specific, precise, and useful — this should read like a competent junior's case note.

STRICT RULES:
- Ground EVERY statement only in the record below. Do NOT invent facts, dates, amounts, parties, citations, or legal conclusions not supported by the record.
- Where the record is silent or ambiguous, say so explicitly and flag it as missing information rather than guessing.
- Be India-litigation aware: recognise the court tier, case type (e.g. §138 NI Act, CrPC/CPC stages, writ, appeal), typical procedure for that case type, and limitation/statutory-compliance considerations — but only assert what the record + well-settled procedure support.
- If the recorded next-hearing or last-hearing date is in the past relative to today (${new Date().toISOString().slice(0, 10)}), flag that the court record may be stale and the live status must be verified.
- This is informational support for a qualified advocate, NOT legal advice, and must be verified against the official record.

COVER (across the structured fields):
1. summary — what the dispute is, the relief/charge involved, and the story so far.
2. posture — the current stage, what that stage means procedurally, and the immediate next procedural step.
3. key_points — salient facts, the parties and their counsel, amounts/quantum, key dates, and the legal issues at play (drawn from the record/documents).
4. next_steps — prioritised, concrete actions (documents to file/serve, evidence to prepare, dates to confirm, compliance to verify), most urgent first.
5. risk_flags — deadlines, limitation/statutory-notice compliance, missing documents or data, stale court record, and anything that could prejudice the client.
6. arguments — the legal arguments to advance for this client, and the likely opposing arguments to anticipate and rebut; ground them in the record + well-settled Indian law (cite the provision/principle, not invented case-law).
7. what_to_present — exactly what to bring/submit at the next hearing: documents, written submissions, authorities to cite, and the prayer/relief to seek. If the record is too thin, say what's needed first rather than inventing.
8. sources — list the SPECIFIC record items you grounded this briefing in (hearings by date, orders by date, documents by name), so the advocate can verify each claim. Only list items that actually appear in the record below.
9. confidence — your honest 0-1 self-assessment that the above is well-grounded in the record (not a prediction of the outcome). Be calibrated and self-critical: score LOW (<0.6) when the record is thin (few/no hearings, no orders, no documents), ambiguous, or stale, so a human reviews before relying; score HIGH (>=0.8) only when the record richly supports every point.

CASE: ${c.title}
CNR: ${c.cnr ?? "—"} | Court: ${c.court ?? "—"} | Type: ${c.caseType ?? "—"} | Stage: ${c.stage ?? "—"} | Status: ${c.status ?? "—"} | Next hearing: ${c.nextHearingDate ?? "—"}

PARTIES:
${parties}

HEARING HISTORY:
${hearings}

DOCUMENTS ON RECORD:
${docs}`;
}

export function normalizeCaseSummary(raw: unknown): CaseSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<CaseSummary>;
  if (typeof r.summary !== "string" || !r.summary.trim()) return null;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);
  // A missing/unparseable confidence is treated as unknown → 0.5, which is below the review
  // threshold, so an un-self-assessed briefing is conservatively routed to review (never shown
  // as certain). A returned value is clamped to [0,1].
  const rawConf = typeof r.confidence === "number" && Number.isFinite(r.confidence) ? r.confidence : 0.5;
  const confidence = rawConf < 0 ? 0 : rawConf > 1 ? 1 : rawConf;
  return {
    summary: r.summary.trim(),
    posture: typeof r.posture === "string" ? r.posture.trim() : "",
    key_points: list(r.key_points),
    next_steps: list(r.next_steps),
    risk_flags: list(r.risk_flags),
    arguments: list(r.arguments),
    what_to_present: list(r.what_to_present),
    sources: list(r.sources),
    confidence,
    review: confidence < CASE_SUMMARY_REVIEW_THRESHOLD,
    generated_at: new Date().toISOString(),
  };
}
