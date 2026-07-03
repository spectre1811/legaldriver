// Direct read helpers for LegalDriver API surfaces that don't fit the CourtDataClient
// interface (advocate profile, judge profile/search, timeline). Used by the browsable
// advocate/judge pages. Same env (LD_API_KEY / LD_API_BASE) as the main adapter.

const BASE = () => process.env.LD_API_BASE || "http://13.202.148.71:8080";
export function ldEnabled(): boolean { return !!process.env.LD_API_KEY; }

async function ldGet<T>(path: string): Promise<T | null> {
  const key = process.env.LD_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`${BASE()}${path}`, { headers: { "X-API-Key": key }, signal: AbortSignal.timeout(Number(process.env.LD_API_TIMEOUT_MS ?? "60000")) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch { return null; }
}

export interface AdvocateCaseItem { cnr: string; side?: string; case_type?: string; status?: string; tier?: string; registration_year?: number; advocate_bar_id?: string | null }
export interface AdvocateProfile { bar_id: string; names: string[]; case_count: number; cases: AdvocateCaseItem[]; registration_year?: number | null }
// bar_id is numeric (HC) or slash-form "G/NN/YYYY" (district) — keep slashes raw (:path route).
export const getAdvocateProfile = (barId: string) => ldGet<AdvocateProfile>(`/advocate/${barId.split("/").map(encodeURIComponent).join("/")}`);

export interface JudgeCaseItem { cnr: string; case_type?: string; status?: string; decision_date?: string | null; tier?: string; disposal_nature?: string | null; advocate_names?: string[] }
export interface JudgeProfile { judge_id: string; name: string; case_count: number; returned: number; cases: JudgeCaseItem[] }
export const getJudge = (judgeId: string) => ldGet<JudgeProfile>(`/judge/${encodeURIComponent(judgeId)}`);

export interface AdvocateSearchResult { name_raw: string; bar_id: string | null; cases: number }
export async function searchAdvocates(name: string): Promise<AdvocateSearchResult[]> {
  const d = await ldGet<{ results?: AdvocateSearchResult[] }>(`/search/advocate?name=${encodeURIComponent(name)}`);
  return (d?.results ?? []).filter((r) => (r.name_raw ?? "").trim().length > 2);
}

// /search/party — fuzzy litigant search → the cases that party appears in.
export interface PartyCaseResult { cnr: string; side?: string; name: string; case_type?: string; tier?: string }
export async function searchParties(name: string): Promise<PartyCaseResult[]> {
  const d = await ldGet<{ results?: PartyCaseResult[] }>(`/search/party?name=${encodeURIComponent(name)}`);
  return (d?.results ?? []).filter((r) => (r.name ?? "").trim().length > 1 && r.name !== "XXXXXXX");
}

// /search/case-number — find a case by registration type/number/year (alt to CNR).
export async function searchByCaseNumber(type: string, number: string, year: string): Promise<PartyCaseResult[]> {
  const d = await ldGet<{ results?: PartyCaseResult[] }>(`/search/case-number?type=${encodeURIComponent(type)}&number=${encodeURIComponent(number)}&year=${encodeURIComponent(year)}`);
  return d?.results ?? [];
}

// /stats — corpus coverage counts (for the "we cover N cases" trust signal).
export interface CorpusStats { cases_total: number; by_tier?: Record<string, number>; rich?: Record<string, number> }
export const getStats = () => ldGet<CorpusStats>("/stats");

export interface JudgeSearchResult { judge_id: string; name_raw: string; cases: number }
export async function searchJudges(name: string): Promise<JudgeSearchResult[]> {
  const d = await ldGet<{ results?: JudgeSearchResult[] }>(`/judges?name=${encodeURIComponent(name)}`);
  return d?.results ?? [];
}

// Resolve a coram/judge NAME (as stored on a case) to a judge_id via search.
export async function resolveJudgeId(name: string): Promise<string | null> {
  const clean = name.replace(/HONOURABLE|MR\.?|MS\.?|MRS\.?|JUSTICE|THE|DR\.?/gi, "").trim();
  const token = clean.split(/[\s.]+/).filter((w) => w.length > 2).pop() ?? clean; // distinctive surname
  const results = await searchJudges(token);
  if (!results.length) return null;
  // Prefer an exact-ish name match, else the highest-caseload hit.
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, "");
  const exact = results.find((r) => norm(r.name_raw) === norm(name));
  return (exact ?? results.sort((a, b) => b.cases - a.cases)[0]).judge_id;
}

// Resolve an advocate NAME (as on a judgment/case) to a bar code via search.
export async function resolveAdvocateBar(name: string): Promise<string | null> {
  const clean = name.replace(/^(MR|MS|MRS|M\/S|DR|SHRI|SMT)\.?\s+/i, "").trim();
  const d = await ldGet<{ results?: { name_raw?: string; bar_id?: string | null; cases?: number }[] }>(`/search/advocate?name=${encodeURIComponent(clean)}`);
  const results = (d?.results ?? []).filter((r) => r.bar_id);
  if (!results.length) return null;
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, "");
  const exact = results.find((r) => r.name_raw && norm(r.name_raw) === norm(name));
  return (exact ?? results.sort((a, b) => (b.cases ?? 0) - (a.cases ?? 0))[0]).bar_id ?? null;
}

export interface TimelineEvent { date: string; type: "hearing" | "order" | "process"; detail?: string; judge?: string }
export async function getTimeline(cnr: string): Promise<TimelineEvent[]> {
  const d = await ldGet<{ events?: TimelineEvent[] }>(`/case/${encodeURIComponent(cnr)}/timeline`);
  return d?.events ?? [];
}
