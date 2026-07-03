import type { RetrievalHit } from "./types";
import { brand } from "@/lib/brand";

// Structured output: the answer text, which context indices it relied on, and
// whether it had to abstain. Indices map back to citation objects deterministically.
export const AGENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    answer: { type: "string", description: "Grounded answer with inline [n] citations." },
    used: { type: "array", items: { type: "integer" }, description: "1-based indices of CONTEXT items relied on." },
    abstained: { type: "boolean", description: "true if the context did not support an answer." },
  },
  required: ["answer", "used", "abstained"],
} as const;

export function buildAgentPrompt(
  question: string,
  hits: RetrievalHit[],
  history?: { role: string; content: string }[],
): string {
  const ctx = hits.map((h, i) => `[${i + 1}] (${h.source}) ${h.title} — ${h.ref}\n${h.snippet}`).join("\n\n");
  const hist = (history ?? [])
    .filter((t) => t.content)
    .map((t) => `${t.role.toUpperCase()}: ${t.content}`)
    .join("\n");

  return `You are the Lawyer Agent inside ${brand.name}, assisting an advocate who practises litigation in India.

RULES:
- You are ASSISTIVE. Your output is a suggestion the advocate will verify — it is not legal advice. End every answer with: "Not legal advice — verify against the official record and the bare act."
- GROUND every substantive statement in the CONTEXT below and cite it inline as [n] using the bracket numbers. List the indices you actually relied on in "used".
- Handle BOTH the old and new criminal codes: IPC ↔ BNS, CrPC ↔ BNSS, Indian Evidence Act ↔ BSA. If the user cites an old section, give the new mapping (and vice-versa) when it appears in context. Flag where a mapping is "nearest, not identical".
- Be concrete and practical for Indian practice: procedure, limitation/deadlines, the next procedural step, and what to check. Keep it tight — no padding.
- If the CONTEXT does not support an answer, set "abstained": true, say briefly what specific record or source you would need, and DO NOT invent sections, citations, dates, party names, or case facts.
${hist ? `\nCONVERSATION SO FAR:\n${hist}\n` : ""}
CONTEXT:
${ctx || "(no sources retrieved)"}

QUESTION: ${question}`;
}
