import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import type { RetrievalHit } from "./types";

type DB = SupabaseClient<Database>;

// ── Grounding retrieval (keyless) ────────────────────────────────────────────
// Pulls evidence the agent must cite from two places:
//   1) the GLOBAL legal knowledge pack (legal_reference) — old↔new law, procedure,
//      limitation — biased by statutory refs / topics detected in the question;
//   2) the TENANT matter corpus (RLS-scoped) — the focused matter + its hearings,
//      documents and orders, or a corpus-wide FTS/ilike search when no matter is set.
// No embeddings required: legal lookups are ref/keyword, document search is Postgres
// FTS. (pgvector + Indian Kanoon are gated upgrades layered on this same seam.)

// Distinctive topical keywords — NOT the bare code names (ipc/bns/crpc/bsa), which
// are too broad: an ilike on "ipc" matches every mapping row and washes out ranking.
const STATUTE_KEYWORDS = [
  "cheque", "bail", "fir", "arrest", "murder", "defamation", "sedition",
  "maintenance", "limitation", "cheating", "theft", "rape", "cruelty",
  "quash", "quashing", "electronic", "negligence", "confession",
];

function legalTerms(q: string): string[] {
  const low = q.toLowerCase();
  const out = new Set<string>();
  // section numbers like "498a", "138", "482", "65b"
  for (const m of low.matchAll(/\b(\d{2,4}[a-z]?)\b/g)) out.add(m[1]);
  for (const k of STATUTE_KEYWORDS) if (low.includes(k)) out.add(k);
  return [...out].slice(0, 8);
}

// Rank KB candidates by how many distinct query terms they contain (relevance),
// since PostgREST ilike-OR can't order by match count.
function scoreRef(row: { old_ref: string | null; new_ref: string | null; topic: string | null; title: string | null; summary: string | null }, terms: string[]): number {
  const hay = `${row.old_ref ?? ""} ${row.new_ref ?? ""} ${row.topic ?? ""} ${row.title ?? ""} ${row.summary ?? ""}`.toLowerCase();
  return terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
}

const STOPWORDS = new Set([
  "what", "whats", "next", "step", "steps", "this", "that", "case", "matter", "the", "and",
  "with", "from", "about", "should", "would", "could", "have", "need", "want", "tell", "give",
  "please", "client", "court", "hearing", "order", "details", "detail", "properly", "status",
]);

// Content words for ilike matching (drop stopwords + short tokens; handle apostrophes).
function contentWords(q: string): string[] {
  const words = q
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
  return [...new Set(words)].slice(0, 5);
}

// A CNR-like token (eCourts CNRs are 16 alphanumerics, e.g. GJAH220924142026).
function detectCnr(q: string): string | null {
  const m = q.toUpperCase().match(/\b[A-Z]{2,4}[A-Z0-9]{10,14}\b/);
  return m ? m[0] : null;
}

// Common legal-fluff words that would match every judgment (judge fields all say
// "JUSTICE", etc.) — excluded from corpus term matching.
const CORPUS_FLUFF = new Set(["justice", "court", "honourable", "honble", "matter", "matters", "cite", "order", "orders", "decided", "please", "advocate", "petition", "respondent", "petitioner", "versus", "state", "gujarat"]);

// Real precedent from the FULL open judgments corpus (S3 lake via Athena — all High
// Courts). Returns [] gracefully if the corpus isn't configured. SDK imported lazily.
async function corpusHits(terms: (string | null | undefined)[], limit = 4): Promise<RetrievalHit[]> {
  const clean = [...new Set(
    terms.flatMap((t) => (t ?? "").split(/[^A-Za-z]+/))
      .map((w) => w.trim())
      .filter((w) => w.length > 4 && !CORPUS_FLUFF.has(w.toLowerCase())),
  )].slice(0, 4);
  if (!clean.length) return [];
  try {
    const { searchJudgmentsByTerms, judgmentPdfUrl, courtLabel } = await import("@/lib/court/corpus-athena");
    const rows = await searchJudgmentsByTerms(clean, limit);
    return rows.map((r) => ({
      source: "judgment" as const,
      ref: r.cnr ?? "judgment",
      title: (r.title ?? "judgment").slice(0, 120),
      url: judgmentPdfUrl(r.pdf_link, r.court, r.year, r.src),
      snippet: `${courtLabel(r.court)} · ${r.year ?? ""} · decided ${r.decision_date?.slice(0, 10) ?? "—"}${r.citation ? ` · ${r.citation}` : ""}${r.judge ? ` · ${r.judge}` : ""}${r.disposal_nature ? ` · ${r.disposal_nature}` : ""}`,
    }));
  } catch {
    return [];
  }
}

export async function retrieve(
  sb: DB,
  input: { tenantId: string; question: string; matterId?: string | null; clientId?: string | null },
  limit = 8,
): Promise<RetrievalHit[]> {
  const hits: RetrievalHit[] = [];
  const q = input.question.trim();
  if (!q) return hits;

  // 1) Legal knowledge pack (global; readable under RLS using(true)).
  const terms = legalTerms(q);
  if (terms.length) {
    const ors = terms
      .flatMap((t) => [`old_ref.ilike.%${t}%`, `new_ref.ilike.%${t}%`, `topic.ilike.%${t}%`, `title.ilike.%${t}%`, `summary.ilike.%${t}%`])
      .join(",");
    const { data } = await sb
      .from("legal_reference")
      .select("kind, topic, old_ref, new_ref, title, summary, source")
      .or(ors)
      .limit(20);
    const ranked = (data ?? [])
      .map((r) => ({ r, s: scoreRef(r, terms) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 6);
    for (const { r } of ranked) {
      const ref = [r.old_ref, r.new_ref].filter(Boolean).join(" → ") || r.topic || "reference";
      hits.push({
        source: "legal_reference",
        ref,
        title: r.title ?? r.topic ?? "Legal reference",
        snippet: `${r.summary ?? ""}${r.source ? ` (${r.source})` : ""}`,
      });
    }
  }

  // 2) Tenant matter corpus. All queries are explicitly tenant-scoped so this is
  // safe under both the RLS client (interactive) and the admin client (worker).
  // If no matter is pinned, try to RESOLVE one from a CNR / matching words first,
  // so a free-text question like "next step on Nirav's matter" still grounds.
  let focusMatterId = input.matterId ?? null;
  if (!focusMatterId) {
    const cnr = detectCnr(q);
    const words = contentWords(q);
    if (cnr || words.length) {
      const ors: string[] = [];
      if (cnr) ors.push(`cnr.ilike.%${cnr}%`);
      for (const w of words) ors.push(`title.ilike.%${w}%`);
      let mq = sb.from("matter").select("id").eq("tenant_id", input.tenantId);
      if (input.clientId) mq = mq.eq("client_id", input.clientId);
      const { data: matched } = await (ors.length ? mq.or(ors.join(",")) : mq).limit(2);
      // Only auto-focus when the match is unambiguous (exactly one matter).
      if (matched && matched.length === 1) focusMatterId = matched[0].id;
    }
  }

  if (focusMatterId) {
    const { data: m } = await sb
      .from("matter")
      .select("id, cnr, title, court, stage, status, next_hearing_date, act_names, party_names, judge_names")
      .eq("tenant_id", input.tenantId)
      .eq("id", focusMatterId)
      .maybeSingle();
    if (m) {
      const url = `/dashboard/cases/${m.id}`;
      hits.push({
        source: "matter",
        ref: m.cnr ?? m.title,
        title: m.title,
        url,
        matterId: m.id,
        snippet: `Court: ${m.court ?? "—"}. Stage: ${m.stage ?? "—"}. Status: ${m.status ?? "—"}. Next hearing: ${m.next_hearing_date ?? "—"}. Acts: ${(m.act_names ?? []).join(", ") || "—"}. Parties: ${(m.party_names ?? []).join(" v. ") || "—"}.`,
      });
      const [{ data: hs }, { data: ds }, { data: os }] = await Promise.all([
        sb.from("hearing").select("date, purpose, judge").eq("tenant_id", input.tenantId).eq("matter_id", m.id).order("date", { ascending: false }).limit(6),
        sb.from("document").select("filename, doc_type, parsed_text").eq("tenant_id", input.tenantId).eq("matter_id", m.id).limit(5),
        sb.from("court_order").select("order_date, title").eq("tenant_id", input.tenantId).eq("matter_id", m.id).order("order_date", { ascending: false }).limit(5),
      ]);
      if (hs?.length) {
        hits.push({
          source: "hearing",
          ref: m.cnr ?? m.title,
          title: "Hearing history",
          url,
          matterId: m.id,
          snippet: hs.map((h) => `${h.date}: ${h.purpose ?? ""}${h.judge ? ` (${h.judge})` : ""}`).join("; "),
        });
      }
      for (const d of ds ?? []) {
        if (!d.parsed_text) continue;
        hits.push({ source: "document", ref: d.filename ?? "document", title: d.filename ?? "Document", url, matterId: m.id, snippet: d.parsed_text.slice(0, 400) });
      }
      for (const o of os ?? []) {
        hits.push({ source: "order", ref: o.title ?? "order", title: o.title ?? "Order", url, matterId: m.id, snippet: `${o.order_date ?? ""} ${o.title ?? ""}`.trim() });
      }
      // Real precedent: judgments in the open corpus sharing a (non-generic) party.
      const pName = (m.party_names ?? []).find((p) => p && !/state|union of india|govt/i.test(p));
      hits.push(...(await corpusHits([pName, ...(m.judge_names ?? [])], 3)));
    }
  } else {
    // Corpus-wide: documents via FTS + matters via multi-word ilike (tenant-scoped).
    const words = contentWords(q);
    const cnr = detectCnr(q);
    const ors = [...(cnr ? [`cnr.ilike.%${cnr}%`] : []), ...words.map((w) => `title.ilike.%${w}%`)];
    let mq = sb.from("matter").select("id, cnr, title, court, act_names").eq("tenant_id", input.tenantId);
    if (input.clientId) mq = mq.eq("client_id", input.clientId);
    else if (ors.length) mq = mq.or(ors.join(","));
    const [docs, matters] = await Promise.all([
      sb.from("document").select("filename, parsed_text, matter_id").eq("tenant_id", input.tenantId).textSearch("fts", q, { type: "websearch" }).limit(4),
      input.clientId || ors.length ? mq.limit(4) : Promise.resolve({ data: [] as never[] }),
    ]);
    for (const d of docs.data ?? []) {
      if (!d.parsed_text) continue;
      hits.push({
        source: "document",
        ref: d.filename ?? "document",
        title: d.filename ?? "Document",
        url: d.matter_id ? `/dashboard/cases/${d.matter_id}` : undefined,
        matterId: d.matter_id ?? undefined,
        snippet: d.parsed_text.slice(0, 400),
      });
    }
    for (const m of (matters.data as { id: string; cnr: string | null; title: string; court: string | null; act_names: string[] }[]) ?? []) {
      hits.push({ source: "matter", ref: m.cnr ?? m.title, title: m.title, url: `/dashboard/cases/${m.id}`, matterId: m.id, snippet: `Court: ${m.court ?? "—"}. Acts: ${(m.act_names ?? []).join(", ") || "—"}.` });
    }
    // Precedent from the open judgments corpus matching the question's key terms.
    hits.push(...(await corpusHits([...contentWords(q), detectCnr(q)], 3)));
  }

  // Deep grounding: pull the ACTUAL text of the top precedent judgment (one fetch,
  // S3-cached) so the agent can cite real judgment content, not just metadata.
  if (process.env.JUDGMENT_TEXT_GROUNDING !== "off") {
    const jh = hits.find((h) => h.source === "judgment" && h.url);
    if (jh?.url) {
      try {
        const { getJudgmentText } = await import("@/lib/court/judgment-text");
        const t = await getJudgmentText({ pdfUrl: jh.url, cacheKey: jh.ref });
        if (t?.text) hits.push({ source: "judgment", ref: jh.ref, title: `Excerpt — ${jh.title}`, url: jh.url, snippet: t.text.replace(/\s+/g, " ").slice(0, 800) });
      } catch { /* text grounding is best-effort */ }
    }
  }

  return hits.slice(0, limit);
}
