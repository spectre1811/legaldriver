import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import type { Classification } from "./classify-core";
import { resolveFiling, type FilingResult } from "./autofile";

// WO-33 W4 · Audit-refile — the "re-file as data grows" loop. A document that couldn't be
// matched at ingest (no client/case existed yet) is re-derived against the CURRENT clients &
// cases. Reuses `resolveFiling` in MATCH-ONLY mode so an unattended re-scan can only LINK to
// existing records, never spawn junk ones. A NEW strong (deterministic) match auto-files; a new
// fuzzy match refreshes the Review Inbox suggestion for a human to confirm — never a silent mis-file
// (guardrail: LLM infers, code files; concrete match → file, weak match → review).

type DB = SupabaseClient<Database>;

export type RefileAction =
  | { kind: "file"; clientId: string | null; matterId: string | null }
  | { kind: "suggest"; clientId: string | null; matterId: string | null }
  | { kind: "none" };

// Pure decision (unit-testable, no I/O): given the doc's CURRENT filing and a fresh match-only
// resolution, decide auto-file (a new STRONG match), refresh-suggestion (a new fuzzy match), or
// nothing. Mirrors `decideFiling`'s structural-confidence rule.
export function decideRefile(
  current: { clientId: string | null; matterId: string | null },
  resolved: Pick<FilingResult, "clientId" | "matterId" | "clientStrong" | "matterStrong">,
): RefileAction {
  const newClient = resolved.clientId && resolved.clientId !== current.clientId ? resolved.clientId : null;
  const newMatter = resolved.matterId && resolved.matterId !== current.matterId ? resolved.matterId : null;
  if (!newClient && !newMatter) return { kind: "none" };
  const strong = Boolean((newClient && resolved.clientStrong) || (newMatter && resolved.matterStrong));
  if (strong) {
    // A deterministic match is trustworthy → file to everything the pass resolved, keeping any
    // prior binding. The doc leaves the review queue.
    return { kind: "file", clientId: resolved.clientId ?? current.clientId, matterId: resolved.matterId ?? current.matterId };
  }
  // Fuzzy-only → don't touch the filing; surface the candidate so the human confirms in review.
  return { kind: "suggest", clientId: newClient, matterId: newMatter };
}

export interface RefileSummary { scanned: number; filed: number; suggested: number }

const asStrArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const asStr = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

// Rebuild the minimal Classification `resolveFiling` reads from a document's stored `extracted`
// JSON. `is_legal=true` unlocks matter *matching* — never creation (matchOnly blocks that) — so an
// unfiled doc whose case now exists can be linked.
function classificationFromExtracted(ex: Record<string, unknown>): Classification {
  return {
    doc_type: "other",
    category: "other",
    client_id: null,
    matter_id: null,
    confidence: 0,
    extracted: { parties: asStrArr(ex.parties), dates: asStrArr(ex.dates), amounts: asStrArr(ex.amounts), cnrs: asStrArr(ex.cnrs) },
    summary: "",
    is_legal: true,
    suggested_client_name: asStr(ex.suggestedClientName),
    suggested_matter_title: asStr(ex.suggestedMatterTitle),
  };
}

// A doc can only be re-matched if it carries at least one signal to match on.
function hasSignal(c: Classification): boolean {
  return c.extracted.parties.length > 0 || c.extracted.cnrs.length > 0 || Boolean(c.suggested_client_name) || Boolean(c.suggested_matter_title);
}

// Re-scan one tenant's unfiled / needs-review documents against its current clients & cases.
// `sb` is tenant-scoped by RLS (on-demand action) or the service-role admin client (cron) — in
// BOTH cases every query filters by `tenant_id` explicitly, so the service-role path never leaks.
export async function auditRefileTenant(sb: DB, tenantId: string, limit = 300): Promise<RefileSummary> {
  const { data: docs } = await sb
    .from("document")
    .select("id, client_id, matter_id, extracted")
    .eq("tenant_id", tenantId)
    .filter("extracted->>deletedAt", "is", null)
    .or("extracted->>status.eq.needs_review,and(client_id.is.null,matter_id.is.null)")
    .order("created_at", { ascending: false })
    .limit(limit);

  const now = new Date().toISOString();
  let filed = 0;
  let suggested = 0;
  for (const d of docs ?? []) {
    const ex = ((d.extracted as Record<string, unknown>) ?? {});
    const cls = classificationFromExtracted(ex);
    if (!hasSignal(cls)) continue;
    const resolved = await resolveFiling(sb, tenantId, cls, { matchOnly: true });
    const action = decideRefile({ clientId: d.client_id, matterId: d.matter_id }, resolved);
    if (action.kind === "none") continue;

    if (action.kind === "file") {
      const next = { ...ex, refiledAt: now, refiledBy: "audit" };
      delete (next as Record<string, unknown>).refileSuggestClientId;
      delete (next as Record<string, unknown>).refileSuggestMatterId;
      const { error } = await sb
        .from("document")
        .update({ client_id: action.clientId, matter_id: action.matterId, extracted: next as never })
        .eq("id", d.id);
      if (!error) filed++;
    } else {
      const next = { ...ex, refileSuggestClientId: action.clientId, refileSuggestMatterId: action.matterId, refiledAt: now };
      const { error } = await sb.from("document").update({ extracted: next as never }).eq("id", d.id);
      if (!error) suggested++;
    }
  }
  return { scanned: docs?.length ?? 0, filed, suggested };
}
