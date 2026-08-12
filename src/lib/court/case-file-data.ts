import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { maskName, maskTitle } from "@/lib/court/mask";

type DB = SupabaseClient<Database>;

// Same "null"/"undefined"-string guard as case-detail's page.tsx (the provider occasionally
// persists these AS TEXT for a missing field) — kept local rather than extracted since the two
// existing copies (page.tsx, legaldriver.ts) already diverge slightly on what counts as empty.
const cleanStr = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t && !/^(null|undefined)$/i.test(t) ? t : null;
};

export interface CaseFileParty { side: string; name: string; advocate: string | null }
export interface CaseFileHearing { date: string; purpose: string | null; courtNo: string | null; judge: string | null }
export interface CaseFileOrder { date: string; title: string | null }
export interface CaseFileDeadline { kind: string; dueDate: string; status: string; jurisdictionRule: string | null }

export interface CaseFileData {
  matterId: string;
  title: string;
  cnr: string | null;
  court: string | null;
  caseType: string | null;
  stage: string | null;
  status: string;
  nextHearingDate: string | null;
  lastSyncedAt: string | null;
  source: string | null;
  parties: CaseFileParty[];
  hearings: CaseFileHearing[];
  orders: CaseFileOrder[];
  deadlines: CaseFileDeadline[];
}

// WO-411 · the ONE scoped read for both the case-file PDF export and the read-only public share
// view — same fields, same tenant scoping, so a field added to one surface can't silently drift
// from the other. ALWAYS filters by tenant_id explicitly (not just matter id): the share view's
// caller passes an admin client (bypasses RLS — see src/lib/supabase/admin.ts), so this is the
// only thing standing between a verified share token and cross-tenant data. Deliberately narrow —
// no documents, AI summary, billing, notifications, or client contact info, matching exactly what
// the WO scoped a shared/exported case file to.
export async function loadCaseFileData(supabase: DB, tenantId: string, matterId: string): Promise<CaseFileData | null> {
  const { data: matter } = await supabase
    .from("matter")
    .select("id, title, cnr, court, case_type, stage, status, next_hearing_date, next_hearing_override, last_synced_at, source, parties")
    .eq("id", matterId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!matter) return null;

  const [{ data: hearings }, { data: orders }, { data: deadlines }] = await Promise.all([
    supabase.from("hearing").select("date, purpose, court_no, judge").eq("matter_id", matterId).eq("tenant_id", tenantId).order("date", { ascending: false }),
    supabase.from("court_order").select("order_date, title").eq("matter_id", matterId).eq("tenant_id", tenantId).order("order_date", { ascending: false, nullsFirst: false }),
    supabase.from("deadline").select("kind, due_date, status, jurisdiction_rule").eq("matter_id", matterId).eq("tenant_id", tenantId).neq("status", "dismissed").order("due_date", { ascending: true }),
  ]);

  const rawParties = Array.isArray(matter.parties) ? (matter.parties as { name?: string; side?: string; advocate?: string }[]) : [];
  const parties: CaseFileParty[] = rawParties.map((p) => ({
    side: cleanStr(p.side) ?? "Party",
    name: maskName(cleanStr(p.name) ?? undefined) || "—",
    advocate: maskName(cleanStr(p.advocate) ?? undefined) || null,
  }));

  return {
    matterId: matter.id,
    title: maskTitle(matter.title) || matter.title,
    cnr: matter.cnr,
    court: matter.court,
    caseType: matter.case_type,
    stage: matter.stage,
    status: matter.status,
    nextHearingDate: matter.next_hearing_override || matter.next_hearing_date,
    lastSyncedAt: matter.last_synced_at,
    source: matter.source,
    parties,
    hearings: (hearings ?? []).map((h) => ({ date: h.date, purpose: cleanStr(h.purpose), courtNo: cleanStr(h.court_no), judge: cleanStr(h.judge) })),
    orders: (orders ?? [])
      .filter((o): o is typeof o & { order_date: string } => Boolean(o.order_date))
      .map((o) => ({ date: o.order_date, title: cleanStr(o.title) })),
    deadlines: (deadlines ?? []).map((d) => ({ kind: d.kind, dueDate: d.due_date, status: d.status, jurisdictionRule: cleanStr(d.jurisdiction_rule) })),
  };
}
