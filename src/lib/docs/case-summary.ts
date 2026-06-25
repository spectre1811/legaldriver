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
  generated_at?: string;
}

export const FALLBACK: CaseSummary = {
  summary: "",
  posture: "",
  key_points: [],
  next_steps: [],
  risk_flags: [],
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
  },
  required: ["summary", "posture", "key_points", "next_steps", "risk_flags"],
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
  return {
    summary: r.summary.trim(),
    posture: typeof r.posture === "string" ? r.posture.trim() : "",
    key_points: list(r.key_points),
    next_steps: list(r.next_steps),
    risk_flags: list(r.risk_flags),
    generated_at: new Date().toISOString(),
  };
}
