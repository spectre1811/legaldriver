import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { completeJson } from "@/lib/ai/complete";
import { categoryOf } from "@/lib/docs/categories";
import { resolveSections } from "@/lib/docs/draft/sections";
import { buildGrounding } from "./retrieve";
import { buildDraftPrompt, DRAFT_SCHEMA } from "./prompt";
import type { DraftGrounding, DraftResult, DraftTemplate } from "./types";
import type { Citation } from "../agent/types";

type DB = SupabaseClient<Database>;
type Json = Database["public"]["Tables"]["draft_version"]["Insert"]["meta"];

const DRAFT_MODEL = process.env.DRAFT_MODEL ?? "claude-sonnet-4-6";

// CONTEXT ordering in the prompt = references, then deadlines, then precedent.
// Rebuild the citable list in that exact order so `used` indices map back.
function citationsFor(g: DraftGrounding, used: number[]): Citation[] {
  const items: Citation[] = [
    ...g.references.map((r) => ({ source: "legal_reference" as const, ref: r.ref, title: r.title })),
    ...g.deadlines.map((d) => ({ source: "legal_reference" as const, ref: d.jurisdiction, title: `Deadline: ${d.jurisdiction}` })),
    ...g.precedent.map((p) => ({ source: "judgment" as const, ref: p.ref, title: p.title, url: p.url })),
  ].map((c, i) => ({ n: i + 1, ...c }));
  const idx = used?.length ? [...new Set(used)] : items.map((c) => c.n);
  return idx.filter((n) => n >= 1 && n <= items.length).map((n) => items[n - 1]);
}

// Synthesize the structured draft from grounding. Returns null ONLY when no AI
// backend is available (keyless prod without the worker) → the caller queues it.
export async function synthesizeDraft(g: DraftGrounding): Promise<DraftResult | null> {
  const useDeepseek = process.env.AGENT_BACKEND === "deepseek" && Boolean(process.env.DEEPSEEK_API_KEY);
  const opts = useDeepseek ? { backend: "deepseek" as const, maxTokens: 3500 } : { model: DRAFT_MODEL, maxTokens: 3500 };
  const prompt = buildDraftPrompt(g);
  // One retry: long structured output occasionally comes back as malformed JSON.
  let raw = await completeJson(prompt, DRAFT_SCHEMA as unknown as Record<string, unknown>, opts);
  if (!raw || typeof raw !== "object") raw = await completeJson(prompt, DRAFT_SCHEMA as unknown as Record<string, unknown>, opts);
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<DraftResult> & { used?: number[] };
  if (typeof r.body !== "string" || !r.body.trim()) return null;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);
  return {
    body: r.body,
    assumptions: list(r.assumptions),
    presumptions: list(r.presumptions),
    clarifications: list(r.clarifications),
    bullet_points: list(r.bullet_points),
    citations: citationsFor(g, r.used ?? []),
  };
}

function rowToTemplate(t: Database["public"]["Tables"]["draft_template"]["Row"]): DraftTemplate {
  return {
    id: t.id,
    title: t.title,
    produces_doc_type: t.produces_doc_type,
    jurisdiction: t.jurisdiction,
    default_sections: t.default_sections ?? [],
    // structure is jsonb — coerce to the expected shape defensively.
    structure: Array.isArray(t.structure) ? (t.structure as DraftTemplate["structure"]) : [],
    conventions: t.conventions,
    language: t.language ?? "en",
  };
}

// Choose the best template: explicit override → exact (category + doc_type) →
// category match → any for the produced type. Returns null if the tenant has none.
export async function pickTemplate(
  sb: DB,
  tenantId: string,
  opts: { category: string; docType?: string | null; overrideTemplateId?: string | null },
): Promise<DraftTemplate | null> {
  if (opts.overrideTemplateId) {
    const { data } = await sb.from("draft_template").select("*").eq("tenant_id", tenantId).eq("id", opts.overrideTemplateId).maybeSingle();
    if (data) return rowToTemplate(data);
  }
  const { data: rows } = await sb.from("draft_template").select("*").eq("tenant_id", tenantId).eq("responds_to_category", opts.category);
  if (!rows?.length) return null;
  const exact = opts.docType ? rows.find((r) => r.responds_to_doc_type === opts.docType) : null;
  return rowToTemplate(exact ?? rows[0]);
}

export interface GenerateDraftInput {
  tenantId: string;
  sourceDocumentId: string;
  overrideTemplateId?: string | null;
  overrideSections?: string[] | null;
  language?: string | null;
  userId?: string | null;
}

export interface GenerateDraftOutput {
  draftId: string;
  versionId: string;
  pending: boolean;
  templateTitle?: string;
  sections?: string[];
  noTemplate?: boolean;
}

// Full flow: resolve the source doc → pick a template → resolve sections → build
// grounding → synthesize (or queue) → persist draft + draft_version. Never sends.
export async function generateDraft(sb: DB, input: GenerateDraftInput): Promise<GenerateDraftOutput | null> {
  const { data: doc } = await sb
    .from("document")
    .select("id, filename, doc_type, parsed_text, matter_id, client_id")
    .eq("tenant_id", input.tenantId)
    .eq("id", input.sourceDocumentId)
    .maybeSingle();
  if (!doc) return null;

  const category = categoryOf(doc.doc_type, doc.filename);
  const template = await pickTemplate(sb, input.tenantId, { category, docType: doc.doc_type, overrideTemplateId: input.overrideTemplateId });

  if (!template) {
    // No template for this category — record an empty draft so the UI can surface
    // "pick a template" rather than failing silently.
    const { data: d } = await sb.from("draft").insert({
      tenant_id: input.tenantId, source_document_id: doc.id, matter_id: doc.matter_id, client_id: doc.client_id,
      produces_doc_type: null, status: "draft", title: `Draft for ${doc.filename ?? "document"}`, created_by: input.userId ?? null,
    }).select("id").single();
    return d ? { draftId: d.id, versionId: "", pending: false, noTemplate: true } : null;
  }

  const { sections } = resolveSections({
    override: input.overrideSections,
    templateDefaults: template.default_sections,
    sourceText: doc.parsed_text,
    producesDocType: template.produces_doc_type,
  });

  const language = input.language || template.language || "en";
  const grounding = await buildGrounding(sb, {
    tenantId: input.tenantId, template, sections, language, sourceText: doc.parsed_text ?? "",
    sourceLabel: `${doc.filename ?? "document"} (${doc.doc_type ?? "?"})`, matterId: doc.matter_id,
  });

  const result = await synthesizeDraft(grounding);

  const { data: draftRow } = await sb.from("draft").insert({
    tenant_id: input.tenantId,
    source_document_id: doc.id,
    matter_id: doc.matter_id,
    client_id: doc.client_id,
    template_id: template.id,
    produces_doc_type: template.produces_doc_type,
    sections,
    language,
    title: `${template.title}`,
    status: result ? "draft" : "pending",
    created_by: input.userId ?? null,
  }).select("id").single();
  if (!draftRow) return null;

  const base = { tenant_id: input.tenantId, draft_id: draftRow.id, version: 1 };
  if (result) {
    const { data: v } = await sb.from("draft_version").insert({
      ...base, body: result.body, assumptions: result.assumptions, presumptions: result.presumptions,
      clarifications: result.clarifications, bullet_points: result.bullet_points,
      citations: result.citations as unknown as Json, generated_by: "llm",
    }).select("id").single();
    return { draftId: draftRow.id, versionId: v?.id ?? "", pending: false, templateTitle: template.title, sections };
  }

  // Queue for the self-hosted worker: stash the grounding so it can synthesize.
  const { data: v } = await sb.from("draft_version").insert({
    ...base, body: "", generated_by: "llm",
    meta: { pending: true, grounding } as unknown as Json,
  }).select("id").single();
  return { draftId: draftRow.id, versionId: v?.id ?? "", pending: true, templateTitle: template.title, sections };
}
