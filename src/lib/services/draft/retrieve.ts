import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import type { DraftGrounding, DraftTemplate } from "./types";

type DB = SupabaseClient<Database>;

// Build the grounding for a draft: resolve the legal_reference rows for the chosen
// sections (gives old↔new mappings + summaries), the deadline_rule rows for the
// template's jurisdiction, the matter context (if linked), and optional precedent.
// All tenant-scoped where applicable; safe under RLS or the admin client.

// Distinctive terms from a section string for KB matching ("Section 138" → "138",
// "NI Act s.139" → "139","ni"). Avoids matching on generic words.
function sectionTerms(sections: string[]): string[] {
  const out = new Set<string>();
  for (const s of sections) {
    for (const m of s.matchAll(/\b(\d{1,4}[A-Z]?)\b/g)) out.add(m[1].toLowerCase());
    for (const w of s.toLowerCase().split(/[^a-z]+/)) if (w.length > 2 && !["act", "section", "order", "rule"].includes(w)) out.add(w);
  }
  return [...out].slice(0, 10);
}

export async function buildGrounding(
  sb: DB,
  opts: {
    tenantId: string;
    template: DraftTemplate;
    sections: string[];
    sourceText: string;
    sourceLabel: string;
    matterId?: string | null;
    language?: string | null;
  },
): Promise<DraftGrounding> {
  const terms = sectionTerms(opts.sections.length ? opts.sections : opts.template.default_sections);

  // legal_reference (global; readable under RLS using(true)).
  const references: DraftGrounding["references"] = [];
  if (terms.length) {
    const ors = terms.flatMap((t) => [`old_ref.ilike.%${t}%`, `new_ref.ilike.%${t}%`, `topic.ilike.%${t}%`, `title.ilike.%${t}%`]).join(",");
    const { data } = await sb.from("legal_reference").select("old_ref,new_ref,topic,title,summary,source").or(ors).limit(8);
    for (const r of data ?? []) {
      const ref = [r.old_ref, r.new_ref].filter(Boolean).join(" → ") || r.topic || "reference";
      references.push({ ref, title: r.title ?? r.topic ?? "Legal reference", summary: `${r.summary ?? ""}${r.source ? ` (${r.source})` : ""}` });
    }
  }

  // deadline_rule for the template's jurisdiction (tenant-scoped).
  const deadlines: DraftGrounding["deadlines"] = [];
  const jur = opts.template.jurisdiction?.split(/[\/·,]/)[0]?.trim();
  if (jur) {
    const { data } = await sb.from("deadline_rule").select("jurisdiction,description,days").eq("tenant_id", opts.tenantId).ilike("jurisdiction", `%${jur.replace(/\s+s\.?\d.*$/i, "").trim()}%`).limit(6);
    for (const d of data ?? []) deadlines.push({ jurisdiction: d.jurisdiction, description: d.description ?? "", days: d.days });
  }

  // Matter context (if the draft is linked to a case).
  let matter: DraftGrounding["matter"] = null;
  if (opts.matterId) {
    const { data: m } = await sb.from("matter").select("title,cnr,court,stage,party_names").eq("tenant_id", opts.tenantId).eq("id", opts.matterId).maybeSingle();
    if (m) matter = { title: m.title, cnr: m.cnr, court: m.court, stage: m.stage, parties: m.party_names ?? [] };
  }

  // Real precedent from the open judgments corpus (S3 lake via Athena). Keyed to the
  // section terms + the matter's parties; one top judgment's real text is pulled in.
  // Gracefully empty if the corpus isn't configured or DRAFT_PRECEDENT=off.
  const precedent = await draftPrecedent([...terms, ...(matter?.parties ?? [])]);

  return {
    template: opts.template,
    sections: opts.sections,
    language: opts.language || opts.template.language || "en",
    sourceText: opts.sourceText,
    sourceLabel: opts.sourceLabel,
    matter,
    references,
    deadlines,
    precedent,
  };
}

const PRECEDENT_FLUFF = new Set(["state", "gujarat", "union", "india", "court", "act", "section", "order", "rule"]);

async function draftPrecedent(terms: string[]): Promise<DraftGrounding["precedent"]> {
  if (process.env.DRAFT_PRECEDENT === "off") return [];
  const clean = [...new Set(terms.map((t) => (t ?? "").trim().toLowerCase()).filter((w) => w.length > 4 && !PRECEDENT_FLUFF.has(w)))].slice(0, 4);
  if (!clean.length) return [];
  try {
    const { searchJudgmentsByTerms, judgmentPdfUrl, courtLabel } = await import("@/lib/court/corpus-athena");
    const rows = await searchJudgmentsByTerms(clean, 3);
    const out: DraftGrounding["precedent"] = rows.map((r) => ({
      ref: r.cnr ?? "judgment",
      title: (r.title ?? "judgment").slice(0, 120),
      url: judgmentPdfUrl(r.pdf_link, r.court, r.year, r.src),
      snippet: `${courtLabel(r.court)} · ${r.year ?? ""}${r.citation ? ` · ${r.citation}` : ""}${r.disposal_nature ? ` · ${r.disposal_nature}` : ""}`,
    }));
    // Deep grounding: pull the top precedent's real text (one fetch, S3-cached).
    if (out[0]?.url && process.env.JUDGMENT_TEXT_GROUNDING !== "off") {
      try {
        const { getJudgmentText } = await import("@/lib/court/judgment-text");
        const t = await getJudgmentText({ pdfUrl: out[0].url, cacheKey: out[0].ref });
        if (t?.text) out.push({ ref: out[0].ref, title: `Excerpt — ${out[0].title}`, url: out[0].url, snippet: t.text.replace(/\s+/g, " ").slice(0, 800) });
      } catch { /* best-effort */ }
    }
    return out;
  } catch {
    return [];
  }
}
