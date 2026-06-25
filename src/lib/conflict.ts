import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";

type DB = SupabaseClient<Database>;

export interface ConflictHit {
  name: string;
  where: "client" | "case party" | "adverse party";
  score: number; // 0..1
  ref?: string; // matter id when applicable
}

const STOP = new Set(["v", "vs", "versus", "ltd", "limited", "pvt", "co", "corp", "inc", "and", "the", "&", "m/s", "mr", "mrs", "ms", "adv"]);

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function tokens(s: string): Set<string> {
  return new Set(norm(s).split(" ").filter((t) => t.length > 1 && !STOP.has(t)));
}
// Jaccard token overlap — cheap, dependency-free fuzzy match.
function similarity(a: string, b: string): number {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = new Set([...ta, ...tb]).size;
  const jac = inter / union;
  // boost exact substring containment (e.g. "Sharma" in "Rajesh Sharma")
  return Math.max(jac, norm(a).includes(norm(b)) || norm(b).includes(norm(a)) ? 0.8 : 0);
}

// Fuzzy-match a proposed party name against existing clients, case parties, and
// recorded adverse parties for the tenant. Returns hits above the threshold.
export async function checkConflicts(sb: DB, tenantId: string, name: string, threshold = 0.45): Promise<ConflictHit[]> {
  if (!name.trim()) return [];
  const [{ data: clients }, { data: matters }, { data: adverse }] = await Promise.all([
    sb.from("client").select("name").eq("tenant_id", tenantId).limit(500),
    sb.from("matter").select("id, title, parties").eq("tenant_id", tenantId).limit(500),
    sb.from("adverse_party").select("name, matter_id").eq("tenant_id", tenantId).limit(500),
  ]);

  const hits: ConflictHit[] = [];
  for (const c of clients ?? []) {
    const s = similarity(name, c.name);
    if (s >= threshold) hits.push({ name: c.name, where: "client", score: s });
  }
  for (const m of matters ?? []) {
    const parties = (Array.isArray(m.parties) ? m.parties : []) as { name?: string }[];
    for (const p of parties) {
      if (!p.name) continue;
      const s = similarity(name, p.name);
      if (s >= threshold) hits.push({ name: p.name, where: "case party", score: s, ref: m.id });
    }
  }
  for (const a of adverse ?? []) {
    const s = similarity(name, a.name);
    if (s >= threshold) hits.push({ name: a.name, where: "adverse party", score: s, ref: a.matter_id ?? undefined });
  }
  return hits.sort((x, y) => y.score - x.score).slice(0, 8);
}
