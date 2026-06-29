// Deterministic-first statutory section identification for the drafting agent
// (project convention #5: the LLM infers, deterministic code verifies/gates). We
// never invent a section: candidates come from (a) the user's explicit override,
// (b) sections actually CITED in the source document, and (c) the template's
// default_sections + a small static category map. The LLM is only used downstream
// to disambiguate — and anything unresolved becomes a "clarification", not a guess.

// Extract statutory references cited inside a document's text. Conservative regexes
// over the common Indian-litigation citation forms; returns normalised, de-duped.
export function extractCitedSections(text: string): string[] {
  if (!text) return [];
  const t = text.replace(/\s+/g, " ");
  const out = new Set<string>();

  // "u/s 138", "under section 138", "sec. 420", "s. 482" (+ optional letter: 498A)
  for (const m of t.matchAll(/\b(?:u\/s|under section|section|sec\.?|s\.)\s*([0-9]{1,4}\s?[A-Z]?)\b/gi)) {
    out.add(`Section ${m[1].replace(/\s+/g, "").toUpperCase()}`);
  }
  // "Order VIII", "Order 8 Rule 1"
  for (const m of t.matchAll(/\bOrder\s+([IVXLC]+|\d{1,2})(?:\s+Rule\s+(\d{1,2}))?/gi)) {
    out.add(`Order ${m[1].toUpperCase()}${m[2] ? ` Rule ${m[2]}` : ""}`);
  }
  // "Article 226"
  for (const m of t.matchAll(/\bArticle\s+(\d{1,3}[A-Z]?)\b/gi)) out.add(`Article ${m[1].toUpperCase()}`);
  // Act-qualified refs: "NI Act 138", "IPC 420", "BNS 318", "CrPC 438", "BNSS 482"
  for (const m of t.matchAll(/\b(NI Act|IPC|BNS|CrPC|BNSS|IEA|BSA|CPC|Arbitration Act|Consumer Act)\s*(?:s\.?|section)?\s*([0-9]{1,4}[A-Z]?)\b/gi)) {
    out.add(`${m[1].toUpperCase().replace("NI ACT", "NI Act").replace("ARBITRATION ACT", "Arbitration Act").replace("CONSUMER ACT", "Consumer Act")} ${m[2].toUpperCase()}`);
  }
  return [...out].slice(0, 20);
}

// Static backstop: candidate sections by the DRAFT's doc_type, used only when the
// template carries none and the source cites none. Intentionally minimal — the
// authoritative source is the draft_template.default_sections seed pack.
const STATIC_BY_DOC_TYPE: Record<string, string[]> = {
  reply_notice: ["NI Act s.139"],
  written_statement: ["CPC Order VIII r.1"],
  application: [],
  affidavit: [],
  vakalatnama: [],
};

// Resolve the section set deterministically. Override wins outright (user-specified).
// Otherwise union template defaults + cited-in-source + static backstop.
export function resolveSections(opts: {
  override?: string[] | null;
  templateDefaults?: string[] | null;
  sourceText?: string | null;
  producesDocType?: string | null;
}): { sections: string[]; cited: string[]; fromOverride: boolean } {
  const cited = extractCitedSections(opts.sourceText ?? "");
  if (opts.override && opts.override.length) {
    return { sections: [...new Set(opts.override)], cited, fromOverride: true };
  }
  const set = new Set<string>([...(opts.templateDefaults ?? []), ...cited]);
  if (!set.size) for (const s of STATIC_BY_DOC_TYPE[opts.producesDocType ?? ""] ?? []) set.add(s);
  return { sections: [...set].slice(0, 12), cited, fromOverride: false };
}
