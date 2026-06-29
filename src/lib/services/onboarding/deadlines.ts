import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";

type DB = SupabaseClient<Database>;

// Deterministic deadline materializer (PROPOSE mode — convention #5: code computes
// deadlines, never the LLM; and they land as 'proposed' for human confirmation
// because a wrong limitation date can prejudice a client). Every proposed deadline
// is anchored to a CONCRETE dated event we actually have, and labelled with its
// rule + basis so the advocate can verify before confirming.

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface Candidate { kind: string; jurisdiction: string; days: number; due: string; basis: string }

// Propose deadlines for one matter from its dated record. Returns candidates.
function candidatesFor(
  matter: { act_names: string[] | null; case_type: string | null },
  orders: { order_date: string | null }[],
  docs: { doc_type: string | null; created_at: string }[],
  rulesByKind: Map<string, { jurisdiction: string; days: number }>,
): Candidate[] {
  const out: Candidate[] = [];
  const hay = `${(matter.act_names ?? []).join(" ")} ${matter.case_type ?? ""}`.toLowerCase();
  const propose = (kind: string, anchorIso: string, basis: string, extraDays = 0) => {
    const r = rulesByKind.get(kind);
    if (!r) return;
    out.push({ kind, jurisdiction: r.jurisdiction, days: r.days, due: addDays(anchorIso, r.days + extraDays), basis });
  };

  // NI Act §138 windows — anchored to a demand/legal-notice document's date.
  if (/\b138\b|cheque|negotiable/.test(hay)) {
    const notice = docs.find((d) => d.doc_type === "demand_notice" || d.doc_type === "legal_notice");
    if (notice) {
      const anchor = notice.created_at.slice(0, 10);
      propose("payment_window", anchor, `15-day payment window from the demand notice (${anchor})`);
      // file_complaint accrues after the 15-day payment window expires.
      const pw = rulesByKind.get("payment_window")?.days ?? 15;
      propose("file_complaint", anchor, `complaint window after the ${pw}-day payment window (notice ${anchor})`, pw);
    }
  }

  // Post-order limitation windows — anchored to the most recent court-order date.
  const orderDates = orders.map((o) => o.order_date).filter((d): d is string => !!d).sort().reverse();
  if (orderDates.length) {
    const anchor = orderDates[0].slice(0, 10);
    for (const kind of ["review", "first_appeal_hc", "revision"]) propose(kind, anchor, `from the order dated ${anchor}`);
  }

  return out;
}

export async function materializeDeadlines(supabase: DB, tenantId: string, opts?: { matterId?: string }): Promise<number> {
  // Index the tenant's deadline rules by kind (curated subset we anchor confidently).
  const { data: rules } = await supabase.from("deadline_rule").select("jurisdiction, kind, days").eq("tenant_id", tenantId);
  const rulesByKind = new Map<string, { jurisdiction: string; days: number }>();
  for (const r of rules ?? []) if (!rulesByKind.has(r.kind)) rulesByKind.set(r.kind, { jurisdiction: r.jurisdiction, days: r.days });
  if (!rulesByKind.size) return 0;

  let mq = supabase.from("matter").select("id, act_names, case_type").eq("tenant_id", tenantId);
  if (opts?.matterId) mq = mq.eq("id", opts.matterId);
  const { data: matters } = await mq.limit(opts?.matterId ? 1 : 100);
  if (!matters?.length) return 0;

  let proposed = 0;
  for (const m of matters) {
    const [{ data: orders }, { data: docs }, { data: existing }] = await Promise.all([
      supabase.from("court_order").select("order_date").eq("tenant_id", tenantId).eq("matter_id", m.id),
      supabase.from("document").select("doc_type, created_at").eq("tenant_id", tenantId).eq("matter_id", m.id),
      supabase.from("deadline").select("kind, due_date").eq("tenant_id", tenantId).eq("matter_id", m.id),
    ]);
    const seen = new Set((existing ?? []).map((d) => `${d.kind}@${d.due_date}`)); // idempotent: skip dupes
    const cands = candidatesFor(m, orders ?? [], docs ?? [], rulesByKind);
    for (const c of cands) {
      if (seen.has(`${c.kind}@${c.due}`)) continue;
      const { error } = await supabase.from("deadline").insert({
        tenant_id: tenantId, matter_id: m.id, kind: c.kind, due_date: c.due, status: "proposed",
        jurisdiction_rule: `${c.jurisdiction} / ${c.kind}`, source: "materializer", basis: c.basis,
      });
      if (!error) { proposed++; seen.add(`${c.kind}@${c.due}`); }
    }
  }
  return proposed;
}
