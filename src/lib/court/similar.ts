import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";

type DB = SupabaseClient<Database>;

// ── Similar-case discovery (Phase 3 · E4) ────────────────────────────────────
// "What else is relevant?" — find tenant cases that share parties, advocates,
// judges, or acts with the current one. Uses the GIN-indexed denormalized arrays
// on matter (party_names/advocate_names/judge_names/act_names) via overlap probes,
// then scores candidates by weighted shared-dimension overlap. RLS scopes every
// read to the tenant, so this never leaks across firms.

export interface MatterFacets {
  id: string;
  party_names: string[];
  advocate_names: string[];
  judge_names: string[];
  act_names: string[];
}

export interface SimilarCase {
  id: string;
  cnr: string | null;
  title: string;
  court: string | null;
  next_hearing_date: string | null;
  score: number;
  shared: { parties: string[]; advocates: string[]; judges: string[]; acts: string[] };
}

const WEIGHT = { parties: 3, acts: 2, advocates: 2, judges: 1.5 } as const;

const COLS = "id, cnr, title, court, next_hearing_date, party_names, advocate_names, judge_names, act_names";

type Row = Pick<
  Database["public"]["Tables"]["matter"]["Row"],
  "id" | "cnr" | "title" | "court" | "next_hearing_date" | "party_names" | "advocate_names" | "judge_names" | "act_names"
>;

const inter = (a: string[], b: string[]) => {
  const set = new Set((b ?? []).map((x) => x.toLowerCase()));
  return [...new Set((a ?? []).filter((x) => set.has(x.toLowerCase())))];
};

export async function findSimilarCases(sb: DB, matter: MatterFacets, limit = 6): Promise<SimilarCase[]> {
  const probes = (
    [
      { col: "party_names", vals: matter.party_names ?? [] },
      { col: "advocate_names", vals: matter.advocate_names ?? [] },
      { col: "judge_names", vals: matter.judge_names ?? [] },
      { col: "act_names", vals: matter.act_names ?? [] },
    ] as const
  ).filter((p) => p.vals.length);
  if (!probes.length) return [];

  // One indexed overlap probe per non-empty dimension; union the candidates.
  const results = await Promise.all(
    probes.map((p) => sb.from("matter").select(COLS).overlaps(p.col, p.vals).neq("id", matter.id).limit(40)),
  );

  const byId = new Map<string, Row>();
  for (const r of results) for (const row of (r.data as Row[] | null) ?? []) byId.set(row.id, row);

  const scored = [...byId.values()].map((row) => {
    const shared = {
      parties: inter(matter.party_names, row.party_names),
      advocates: inter(matter.advocate_names, row.advocate_names),
      judges: inter(matter.judge_names, row.judge_names),
      acts: inter(matter.act_names, row.act_names),
    };
    const score =
      shared.parties.length * WEIGHT.parties +
      shared.acts.length * WEIGHT.acts +
      shared.advocates.length * WEIGHT.advocates +
      shared.judges.length * WEIGHT.judges;
    return {
      id: row.id,
      cnr: row.cnr,
      title: row.title,
      court: row.court,
      next_hearing_date: row.next_hearing_date,
      score,
      shared,
    };
  });

  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}
