// Direct read helpers for LegalDriver API surfaces that don't fit the CourtDataClient
// interface (advocate profile, judge profile/search, timeline). Used by the browsable
// advocate/judge pages. Same env (LD_API_KEY / LD_API_BASE) as the main adapter.
import { resolveLdApiBase, LD_CONSOLE_FETCH_TIMEOUT_MS } from "./ld-api-base";

export function ldEnabled(): boolean { return !!process.env.LD_API_KEY; }

// strict: only a real 404 maps to null (→ the page's notFound()); 5xx/timeout/network
// throw so the segment error boundary renders retry instead of a phantom "page not found"
// (a cold heavy-roster profile can hit the API's read statement cap → 500, seen live 2026-07-24).
// Non-strict (timeline) keeps degrade-to-null. WO-289: EVERY console search (advocate/judge/party/
// case-number/order-text) is now strict too — a 503/timeout must surface as an honest "search
// unavailable" state, never silently collapse to an empty result set (that "lying empty" is exactly
// what made the WO-285 twin bug invisible: /search/advocate 503ing read as "no advocates named Patel").
async function ldGet<T>(path: string, strict = false): Promise<T | null> {
  const key = process.env.LD_API_KEY;
  if (!key) return null;
  const base = resolveLdApiBase(); // config error throws loudly, outside the network try/catch (fail-closed)
  try {
    const res = await fetch(`${base}${path}`, { headers: { "X-API-Key": key }, signal: AbortSignal.timeout(LD_CONSOLE_FETCH_TIMEOUT_MS) });
    if (res.ok) return (await res.json()) as T;
    if (strict && res.status !== 404) throw new Error(`LD API ${res.status} on ${path.split("?")[0]}`);
    return null;
  } catch (e) {
    if (strict) throw e;
    return null;
  }
}

export interface AdvocateCaseItem { cnr: string; side?: string; case_type?: string; status?: string; tier?: string; registration_year?: number; advocate_bar_id?: string | null }
// WO-281: a practice-court from the roster enrichment (WO-280) — one court + this advocate's case count there.
export interface AdvocatePracticeCourt { court_id: number; name: string; tier?: string | null; cases: number }
// WO-281: `caseload` (full-corpus PENDING/DISPOSED split — accurate even for a >limit roster, unlike the
// windowed client count), `practice_courts` (top courts), and `hc_codes` (HC display code(s)) are the
// WO-280 enrichment the raw /advocate/{bar_id} endpoint already returns. All optional/honest-empty: an
// older API response or a bare-name advocate omits them → the page degrades to its prior behaviour.
export interface AdvocateProfile { bar_id: string; names: string[]; case_count: number; cases: AdvocateCaseItem[]; registration_year?: number | null; caseload?: { pending?: number; disposed?: number } | null; practice_courts?: AdvocatePracticeCourt[] | null; hc_codes?: (string | number)[] | null }
// bar_id is numeric (HC) or slash-form "G/NN/YYYY" (district) — keep slashes raw (:path route).
export const getAdvocateProfile = (barId: string) => ldGet<AdvocateProfile>(`/advocate/${barId.split("/").map(encodeURIComponent).join("/")}`, true);

export interface JudgeCaseItem { cnr: string; case_type?: string; status?: string; decision_date?: string | null; tier?: string; disposal_nature?: string | null; advocate_names?: string[] }
export interface JudgeProfile { judge_id: string; name: string; case_count: number; returned: number; cases: JudgeCaseItem[] }
export const getJudge = (judgeId: string) => ldGet<JudgeProfile>(`/judge/${encodeURIComponent(judgeId)}`, true);

// WO-289: console search is STRICT — a 503/timeout/network failure THROWS instead of silently
// degrading to []. This is the root-cause fix for the "Patel = 8s then empty" bug (INBOX 07-28):
// the API already 503s honestly on a too-heavy query (WO-285); the console must surface that as an
// error state, never render it as "0 advocates named Patel". Callers that want the OLD degrade-to-
// null behaviour (out of this WO's scope — the judgment-reader's coram/advocate redirect routes)
// catch locally below, so this doesn't change their contract.
export interface AdvocateSearchResult { name_raw: string; bar_id: string | null; cases: number }
export async function searchAdvocates(name: string): Promise<AdvocateSearchResult[]> {
  const d = await ldGet<{ results?: AdvocateSearchResult[] }>(`/search/advocate?name=${encodeURIComponent(name)}`, true);
  return (d?.results ?? []).filter((r) => (r.name_raw ?? "").trim().length > 2);
}

// /search/party — fuzzy litigant search → the cases that party appears in.
export interface PartyCaseResult { cnr: string; side?: string; name: string; case_type?: string; tier?: string }
export async function searchParties(name: string): Promise<PartyCaseResult[]> {
  const d = await ldGet<{ results?: PartyCaseResult[] }>(`/search/party?name=${encodeURIComponent(name)}`, true);
  return (d?.results ?? []).filter((r) => (r.name ?? "").trim().length > 1 && r.name !== "XXXXXXX");
}

// /search/case-number — find a case by registration type/number/year (alt to CNR).
export async function searchByCaseNumber(type: string, number: string, year: string): Promise<PartyCaseResult[]> {
  const d = await ldGet<{ results?: PartyCaseResult[] }>(`/search/case-number?type=${encodeURIComponent(type)}&number=${encodeURIComponent(number)}&year=${encodeURIComponent(year)}`, true);
  return d?.results ?? [];
}

// /stats — corpus coverage counts (for the "we cover N cases" trust signal). Left non-strict: a
// missing coverage banner is an acceptable degrade for this non-critical widget (WO-285 already
// made /stats itself honest — reltuples-based, cached, 503-not-500 on the provider side).
export interface CorpusStats { cases_total: number; by_tier?: Record<string, number>; rich?: Record<string, number> }
export const getStats = () => ldGet<CorpusStats>("/stats");

export interface JudgeSearchResult { judge_id: string; name_raw: string; cases: number }
export async function searchJudges(name: string): Promise<JudgeSearchResult[]> {
  const d = await ldGet<{ results?: JudgeSearchResult[] }>(`/judges?name=${encodeURIComponent(name)}`, true);
  return d?.results ?? [];
}

// /search/order-text — BM25 full-text search over our own ingested order/judgment text (WO-289;
// replaces the Athena-backed "Case Research" corpus browser in the render path). Strict: the API
// 503s honestly on a too-heavy query (WO-215 residual) — surface that, never a lying empty.
export interface OrderTextHit {
  cnr: string; order_date?: string | null; description?: string | null; case_type?: string | null;
  status?: string | null; registration_year?: number | null; tier?: string | null;
  court_id?: number | null; court_name?: string | null; bench_label?: string | null;
  coram?: string | null; registration_number?: string | null; state_code?: string | null; state_name?: string | null;
  snippet?: string | null; score?: number | null; match_kind?: string | null;
}
export async function searchOrderText(q: string, limit = 25): Promise<OrderTextHit[]> {
  const d = await ldGet<{ results?: OrderTextHit[] }>(`/search/order-text?q=${encodeURIComponent(q)}&limit=${limit}`, true);
  return (d?.results ?? []).filter((r) => !!r.cnr);
}

// Resolve a coram/judge NAME (as stored on a case) to a judge_id via search. Best-effort: this backs
// a redirect route (out of WO-289's scope), so a search failure degrades to "no match" (null) rather
// than throwing — the strictness above is for the directory page, which handles the throw itself.
export async function resolveJudgeId(name: string): Promise<string | null> {
  const clean = name.replace(/HONOURABLE|MR\.?|MS\.?|MRS\.?|JUSTICE|THE|DR\.?/gi, "").trim();
  const token = clean.split(/[\s.]+/).filter((w) => w.length > 2).pop() ?? clean; // distinctive surname
  let results: JudgeSearchResult[];
  try { results = await searchJudges(token); } catch { return null; }
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

// date can be null — the /timeline source returns undated orders/hearings (verified live). Keep it
// honest so consumers guard it (a bare `date.localeCompare` once crashed the whole case page).
// order_id: from the live /timeline this is the PROVIDER order id (number). Before rendering we
// remap it to the court_order ROW id (uuid string) that the order-pdf route resolves by — hence
// the union type. `undefined` = no streamable PDF (renders as plain text, no dead link).
export interface TimelineEvent { date: string | null; type: "hearing" | "order" | "process"; detail?: string; judge?: string; order_id?: number | string }
export async function getTimeline(cnr: string): Promise<TimelineEvent[]> {
  const d = await ldGet<{ events?: TimelineEvent[] }>(`/case/${encodeURIComponent(cnr)}/timeline`);
  return d?.events ?? [];
}
