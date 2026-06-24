// Shared AI case-summary core (pure — no path-alias/app imports) so it can be used
// by the in-app action and the self-hosted worker. Produces a plain-language
// summary, suggested next steps, and risk flags from the case record.

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
  next_steps: string[];
  risk_flags: string[];
  generated_at?: string;
}

export const CASE_SUMMARY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string", description: "2-4 sentence plain-language overview of the case, its posture, and what's happened" },
    next_steps: { type: "array", items: { type: "string" }, description: "concrete next actions for the advocate, most urgent first" },
    risk_flags: { type: "array", items: { type: "string" }, description: "deadlines, limitation risks, or gaps to watch; empty if none" },
  },
  required: ["summary", "next_steps", "risk_flags"],
} as const;

export function buildCaseSummaryPrompt(c: CaseSummaryInput): string {
  const parties = c.parties.map((p) => `- ${p.name ?? "?"}${p.side ? ` (${p.side})` : ""}${p.advocate ? ` — adv. ${p.advocate}` : ""}`).join("\n") || "(none on record)";
  const hearings = c.hearings.slice(0, 12).map((h) => `- ${h.date}: ${h.purpose ?? "hearing"}${h.judge ? ` before ${h.judge}` : ""}`).join("\n") || "(none on record)";
  const docs = c.documents.slice(0, 8).map((d) => `- ${d.filename ?? "document"} (${d.doc_type ?? "?"})${d.parsed_text ? `: ${d.parsed_text.slice(0, 500)}` : ""}`).join("\n") || "(none)";

  return `You are assisting an Indian advocate. From the case record below, produce a concise, practical briefing: a short summary, prioritized next steps, and any risk flags (deadlines/limitation/missing info). Be specific and grounded ONLY in the record — do not invent facts, dates, or law. This is informational support, not legal advice.

CASE: ${c.title}
CNR: ${c.cnr ?? "—"} | Court: ${c.court ?? "—"} | Type: ${c.caseType ?? "—"} | Stage: ${c.stage ?? "—"} | Status: ${c.status ?? "—"} | Next hearing: ${c.nextHearingDate ?? "—"}

PARTIES:
${parties}

HEARING HISTORY:
${hearings}

DOCUMENTS:
${docs}`;
}

export function normalizeCaseSummary(raw: unknown): CaseSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<CaseSummary>;
  if (typeof r.summary !== "string" || !r.summary.trim()) return null;
  return {
    summary: r.summary.trim(),
    next_steps: Array.isArray(r.next_steps) ? r.next_steps.filter((s) => typeof s === "string") : [],
    risk_flags: Array.isArray(r.risk_flags) ? r.risk_flags.filter((s) => typeof s === "string") : [],
    generated_at: new Date().toISOString(),
  };
}
