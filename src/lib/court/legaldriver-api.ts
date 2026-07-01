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

export interface AdvocateCaseItem { cnr: string; side?: string; case_type?: string; status?: string; tier?: string; registration_year?: number }
export interface AdvocateProfile { bar_id: string; names: string[]; case_count: number; cases: AdvocateCaseItem[] }
export const getAdvocateProfile = (barId: string) => ldGet<AdvocateProfile>(`/advocate/${encodeURIComponent(barId)}`);

export interface JudgeCaseItem { cnr: string; case_type?: string; status?: string; decision_date?: string | null; tier?: string }
export interface JudgeProfile { judge_id: string; name: string; case_count: number; returned: number; cases: JudgeCaseItem[] }
export const getJudge = (judgeId: string) => ldGet<JudgeProfile>(`/judge/${encodeURIComponent(judgeId)}`);

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

export interface TimelineEvent { date: string; type: "hearing" | "order" | "process"; detail?: string; judge?: string }
export async function getTimeline(cnr: string): Promise<TimelineEvent[]> {
  const d = await ldGet<{ events?: TimelineEvent[] }>(`/case/${encodeURIComponent(cnr)}/timeline`);
  return d?.events ?? [];
}
