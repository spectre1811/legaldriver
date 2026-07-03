// Pure fuzzy name matching (WO-33 W2) — trigram Jaccard similarity, in JS so it needs no pg_trgm
// RPC / migration (a tenant's client + matter lists are small — dozens, not millions). Used to
// DERIVE the client/case from the party names the classifier extracts, when the strong signals
// (sender email, CNR) didn't fire. Normalizes case, punctuation, and common legal-entity noise
// ("M/s", "Pvt Ltd", "&") so "M/s Sharma & Co." ≈ "Sharma and Company".

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(m\/s|pvt|private|ltd|limited|company|co|and|the|mr|mrs|ms|shri|smt)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trigrams(s: string): Set<string> {
  const t = `  ${normalizeName(s)} `;
  const out = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
}

// Trigram Jaccard similarity in [0,1]. Mirrors Postgres pg_trgm similarity() closely enough for
// short names, which is all we match here.
export function similarity(a: string, b: string): number {
  const A = trigrams(a), B = trigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

// The best candidate id whose name matches ANY of the query strings above `threshold`, or null.
// Conservative by default (0.55) — a weak fuzzy match should route to review, not mis-file.
export function bestMatch(queries: string[], candidates: { id: string; name: string }[], threshold = 0.55): string | null {
  let bestId: string | null = null;
  let best = threshold;
  for (const q of queries) {
    if (!q || q.length < 3) continue;
    for (const cand of candidates) {
      const s = similarity(q, cand.name);
      if (s > best) { best = s; bestId = cand.id; }
    }
  }
  return bestId;
}
