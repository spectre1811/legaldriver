import type { DraftGrounding } from "./types";

// Structured output: the draft body plus the separated assumptions / presumptions /
// clarifications / operative bullets, and which CONTEXT items were relied on. The
// separation is what makes gaps explicit instead of buried in prose (the operator's
// "state assumptions, presumptions, clarifications" requirement).
export const DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    body: { type: "string", description: "The draft document in markdown, following the template's section structure (cause-title, para-wise content, prayer, verification as applicable). Use inline [n] citations where a statement rests on a CONTEXT item." },
    assumptions: { type: "array", items: { type: "string" }, description: "Facts you ASSUMED because the record was silent but the draft needed them (clearly things to confirm)." },
    presumptions: { type: "array", items: { type: "string" }, description: "Legal presumptions applied (e.g. NI Act s.139 presumption of consideration) and how the draft treats them." },
    clarifications: { type: "array", items: { type: "string" }, description: "Open questions the advocate MUST answer before finalising — missing facts/dates/figures/instructions. Do NOT invent these; surface them." },
    bullet_points: { type: "array", items: { type: "string" }, description: "The operative points / checklist the draft makes — derived from the template's required_points and what the source supports." },
    used: { type: "array", items: { type: "integer" }, description: "1-based indices of CONTEXT items the draft relied on." },
  },
  required: ["body", "assumptions", "presumptions", "clarifications", "bullet_points", "used"],
} as const;

export function buildDraftPrompt(g: DraftGrounding): string {
  const structure = g.template.structure
    .map((s, i) => `${i + 1}. ${s.heading}${s.guidance ? ` — ${s.guidance}` : ""}${s.required_points?.length ? `\n   Required points: ${s.required_points.join("; ")}` : ""}`)
    .join("\n");

  // Numbered CONTEXT so the model can cite [n]; ordering: references, deadlines, precedent.
  const ctx: string[] = [];
  for (const r of g.references) ctx.push(`(${r.ref}) ${r.title} — ${r.summary}`);
  for (const d of g.deadlines) ctx.push(`(deadline) ${d.jurisdiction}: ${d.description} [${d.days} days]`);
  for (const p of g.precedent) ctx.push(`(precedent) ${p.title} — ${p.ref}: ${p.snippet}`);
  const ctxBlock = ctx.map((c, i) => `[${i + 1}] ${c}`).join("\n") || "(no external context retrieved)";

  const matter = g.matter
    ? `MATTER: ${g.matter.title}${g.matter.cnr ? ` (CNR ${g.matter.cnr})` : ""} · Court: ${g.matter.court ?? "—"} · Stage: ${g.matter.stage ?? "—"} · Parties: ${(g.matter.parties ?? []).join(" v. ") || "—"}`
    : "MATTER: (not linked to a case)";

  return `You are a senior Indian advocate's drafting associate. Draft a **${g.template.produces_doc_type.replace(/_/g, " ")}** ("${g.template.title}") in response to the SOURCE DOCUMENT below, for the advocate to review and finalise.

STRICT RULES:
- You are ASSISTIVE. This is a starting draft the advocate WILL edit and verify — it is NOT legal advice and will NOT be sent/filed automatically.
- Ground every substantive legal statement in the CONTEXT items and cite inline as [n]. Use Indian drafting conventions: ${g.template.conventions ?? "standard practice"}.
- Draft ONLY under these statutory sections: ${g.sections.length ? g.sections.join(", ") : "(none resolved — rely on the template structure and flag the gap)"}. Do NOT invent other sections, citations, dates, figures, party names, or facts.
- Where a fact the draft needs is NOT in the source/record, do ONE of: (a) ASSUME it and add it to "assumptions", or (b) leave a clearly-marked placeholder like [TO CONFIRM: …] in the body and add the question to "clarifications". Never fabricate specifics.
- Handle old↔new law (IPC↔BNS, CrPC↔BNSS, IEA↔BSA) using the mappings in CONTEXT; flag "nearest, not identical" where relevant.
- Follow the TEMPLATE STRUCTURE section-by-section. Keep it tight and usable.

TEMPLATE STRUCTURE (draft body must follow this order):
${structure}

${matter}

SOURCE DOCUMENT (${g.sourceLabel}):
${(g.sourceText || "(no text extracted from the source document)").slice(0, 6000)}

CONTEXT (cite as [n]):
${ctxBlock}

Produce the structured JSON. The "body" is the full draft in markdown; end it with: "Assistive draft — not legal advice. Verify against the bare act and the official record before use."`;
}
