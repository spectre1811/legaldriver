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

// One safe ilike token for PostgREST .or() (no commas/parens/percent).
function safeToken(q: string): string | null {
  const t = q
    .replace(/[%,()*]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .sort((a, b) => b.length - a.length)[0];
  return t ? t.replace(/[^a-zA-Z0-9]/g, "") || null : null;
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

  // 2) Tenant matter corpus.
  if (input.matterId) {
    const { data: m } = await sb
      .from("matter")
      .select("id, cnr, title, court, stage, status, next_hearing_date, act_names, party_names, judge_names")
      .eq("id", input.matterId)
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
        sb.from("hearing").select("date, purpose, judge").eq("matter_id", m.id).order("date", { ascending: false }).limit(6),
        sb.from("document").select("filename, doc_type, parsed_text").eq("matter_id", m.id).limit(5),
        sb.from("court_order").select("order_date, title").eq("matter_id", m.id).order("order_date", { ascending: false }).limit(5),
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
    }
  } else {
    // Corpus-wide: documents via FTS + matters via ilike (optionally client-scoped).
    const token = safeToken(q);
    const [docs, matters] = await Promise.all([
      sb.from("document").select("filename, parsed_text, matter_id").textSearch("fts", q, { type: "websearch" }).limit(4),
      token
        ? (input.clientId
            ? sb.from("matter").select("id, cnr, title, court, act_names").eq("client_id", input.clientId).limit(4)
            : sb.from("matter").select("id, cnr, title, court, act_names").or(`title.ilike.%${token}%,cnr.ilike.%${token}%`).limit(4))
        : Promise.resolve({ data: [] as never[] }),
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
  }

  return hits.slice(0, limit);
}
