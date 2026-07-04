// WO-36 Layer 2 · The rubric + judge prompt for the agentic UX tester. The four dimensions MIRROR
// docs/ui-polish-bar.md (the single source both layers score against — do not invent a second bar).
// The prompt asks Claude to act as a senior product designer reviewing ONE screen from its
// accessibility tree, and to return STRUCTURED findings (validated by the caller) — never prose.

export const UX_DIMENSIONS = ["clean", "crisp", "user-friendly", "informational"];

// JSON schema the model must satisfy (enforced via tool_choice in run.mjs, so the model can't drift
// into prose). Kept in sync with qa-agent/findings.mjs (severities/types).
export const FINDINGS_SCHEMA = {
  type: "object",
  required: ["uxScore", "findings"],
  properties: {
    uxScore: { type: "integer", minimum: 1, maximum: 5, description: "overall screen quality on the polish rubric, 5=excellent" },
    findings: {
      type: "array",
      items: {
        type: "object",
        required: ["severity", "type", "summary"],
        properties: {
          severity: { type: "string", enum: ["blocker", "high", "medium", "low", "nit"] },
          type: { type: "string", enum: ["bug", "ux", "a11y", "copy"] },
          summary: { type: "string", description: "one line, specific + actionable" },
          repro: { type: "array", items: { type: "string" }, description: "numbered steps if a bug" },
          evidence: { type: "string", description: "the element/selector/text at fault" },
        },
      },
    },
  },
};

export const SYSTEM_PROMPT = `You are a senior product designer + QA engineer reviewing ONE screen of an Indian legal-practice web app (advocates/law firms). You see the screen's accessibility tree (roles, names, structure) — reason about it like a human using the page.

Judge against this bar (clean · crisp · user-friendly · informational):
- Clear visual + information hierarchy; one obvious primary action per view.
- Designed empty/loading/error states — never a bare "No data", raw error, or [object Object].
- Labels + microcopy are real, specific, in a professional legal-product voice — no dev placeholders, no truncated/ambiguous labels.
- Accessible: every control has an accessible name; headings form a sensible outline; nothing is a nameless button/icon.
- Nothing confusing, dead-ended, or overwhelming for a busy advocate.

Report ONLY genuine issues a human would notice — be precise, cite the offending element, and don't invent problems. Score uxScore 1–5 (5 = a senior designer would ship it as-is). If the screen is clean, return an empty findings array with a high score.`;

// Build the per-route user message from the a11y snapshot (compact JSON — ~200-400 tokens/screen,
// the cost lever that makes a full-app sweep viable vs. per-step screenshots).
export function buildUserMessage(route, a11ySnapshot) {
  const tree = JSON.stringify(a11ySnapshot ?? {}, null, 0);
  const clipped = tree.length > 12000 ? tree.slice(0, 12000) + " …(truncated)" : tree;
  return `Route: ${route}\n\nAccessibility tree:\n${clipped}`;
}
