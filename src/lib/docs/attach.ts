import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";

type DB = SupabaseClient<Database>;

// Identifier-ranked, DETERMINISTIC auto-attach (convention #5: the LLM supplied the
// extracted CNR/parties upstream; the MATCH is code). Used to file inbox documents
// and to claim "already in the system" orphan documents (matter_id is null) onto
// the right open case. Strongest identifier wins; below threshold → left for review.

const THRESHOLD = Number(process.env.CONFIDENCE_THRESHOLD ?? "0.7");
// Generic party tokens that must never carry a match on their own.
const GENERIC = new Set(["state", "union", "india", "govt", "government", "anr", "ors", "others", "the", "of", "and", "vs", "versus", "petitioner", "respondent", "complainant", "accused"]);

// eCourts CNRs are 16 alphanumerics (e.g. GJAH010123452024).
function cnrsFrom(text: string | null | undefined): string[] {
  if (!text) return [];
  return [...new Set((text.toUpperCase().match(/\b[A-Z]{2,4}[A-Z0-9]{10,14}\b/g) ?? []))];
}

function partyTokens(names: string[]): Set<string> {
  const out = new Set<string>();
  for (const n of names) for (const w of (n ?? "").toLowerCase().split(/[^a-z0-9]+/)) if (w.length > 3 && !GENERIC.has(w)) out.add(w);
  return out;
}

export interface AttachMatch { matterId: string; clientId: string | null; score: number; identifier: string }

interface DocLike { id: string; parsed_text: string | null; filename: string | null; extracted: unknown }

// Find the best matter for a document. Precedence: CNR exact (1.0) → party overlap
// (2 distinct non-generic tokens = 0.8, 1 = 0.6). Returns null if nothing clears.
export async function matchDocumentToMatter(sb: DB, tenantId: string, doc: DocLike): Promise<AttachMatch | null> {
  const ex = (doc.extracted ?? {}) as { cnrs?: string[]; parties?: string[] };
  const cnrs = [...new Set([...(ex.cnrs ?? []).map((c) => c.trim().toUpperCase()), ...cnrsFrom(doc.parsed_text)])].filter(Boolean);

  // 1) CNR exact — unambiguous.
  for (const cnr of cnrs) {
    const { data: m } = await sb.from("matter").select("id, client_id").eq("tenant_id", tenantId).eq("cnr", cnr).is("deleted_at", null).maybeSingle(); // skip trashed (WO-43-W2)
    if (m) return { matterId: m.id, clientId: m.client_id, score: 1.0, identifier: `cnr:${cnr}` };
  }

  // 2) Party-name overlap — scored against the matter's denormalized party_names.
  const docTokens = partyTokens([...(ex.parties ?? []), doc.filename ?? ""]);
  if (docTokens.size) {
    const { data: matters } = await sb.from("matter").select("id, client_id, party_names").eq("tenant_id", tenantId).not("party_names", "is", null).is("deleted_at", null).limit(300); // skip trashed (WO-43-W2)
    let best: AttachMatch | null = null;
    for (const m of matters ?? []) {
      const mTokens = partyTokens(m.party_names ?? []);
      let overlap = 0;
      for (const t of docTokens) if (mTokens.has(t)) overlap++;
      const score = overlap >= 2 ? 0.8 : overlap === 1 ? 0.6 : 0;
      if (score && (!best || score > best.score)) best = { matterId: m.id, clientId: m.client_id, score, identifier: `parties:${overlap}` };
    }
    if (best) return best;
  }
  return null;
}

// Sweep documents not yet attached to a case and attach those that clear THRESHOLD.
// Idempotent: only touches matter_id-null docs; writes an audit_event per attach.
export async function sweepOrphanDocuments(sb: DB, tenantId: string, opts?: { limit?: number }): Promise<number> {
  const { data: docs } = await sb
    .from("document")
    .select("id, parsed_text, filename, extracted, client_id")
    .eq("tenant_id", tenantId)
    .is("matter_id", null)
    .limit(opts?.limit ?? 100);
  if (!docs?.length) return 0;

  let attached = 0;
  for (const d of docs) {
    const match = await matchDocumentToMatter(sb, tenantId, d);
    if (!match || match.score < THRESHOLD) continue;
    const update: { matter_id: string; client_id?: string } = { matter_id: match.matterId };
    if (!d.client_id && match.clientId) update.client_id = match.clientId;
    const { error } = await sb.from("document").update(update).eq("id", d.id);
    if (error) continue;
    attached++;
    await sb.from("audit_event").insert({
      tenant_id: tenantId, action: "document.attached", entity: "document", entity_id: d.id,
      after: { matter_id: match.matterId, identifier: match.identifier, score: match.score } as Database["public"]["Tables"]["audit_event"]["Insert"]["after"],
    });
  }
  return attached;
}
