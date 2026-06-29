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

  return {
    template: opts.template,
    sections: opts.sections,
    sourceText: opts.sourceText,
    sourceLabel: opts.sourceLabel,
    matter,
    references,
    deadlines,
    precedent: [], // wired; populated in P-E (open-corpus precedent for drafts)
  };
}
