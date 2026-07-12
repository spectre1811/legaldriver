import { AthenaClient, StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } from "@aws-sdk/client-athena";

// Serverless query over the S3 court-corpus lake (Parquet + Glue + Athena, ap-south-1).
// Partition projection (court/year) → tiny scans → ~free. Reads only; scoped IAM key.
// Cheap by design: ResultReuse caches identical queries for 60 min (repeat = $0).

const REGION = process.env.CORPUS_AWS_REGION ?? "ap-south-1";
const DB = process.env.ATHENA_DB ?? "legaldriver_corpus";
const OUTPUT = process.env.ATHENA_OUTPUT;

export function corpusEnabled(): boolean {
  return Boolean(process.env.CORPUS_AWS_ACCESS_KEY_ID && process.env.CORPUS_AWS_SECRET_ACCESS_KEY && OUTPUT);
}

let _client: AthenaClient | null = null;
function client(): AthenaClient {
  if (!_client) {
    _client = new AthenaClient({
      region: REGION,
      credentials: { accessKeyId: process.env.CORPUS_AWS_ACCESS_KEY_ID!, secretAccessKey: process.env.CORPUS_AWS_SECRET_ACCESS_KEY! },
    });
  }
  return _client;
}

// A cold, broad corpus scan can outrun the poll budget. Distinguish "still running when we gave up"
// from a hard Athena failure so the caller (and logs) can treat it as an honest, retryable timeout —
// not a crash. The dashboard error boundary renders a handled retry state for either.
export class AthenaTimeoutError extends Error {
  constructor(public readonly queryId: string, public readonly waitedMs: number) {
    super(`athena: query ${queryId} did not finish within ${waitedMs}ms`);
    this.name = "AthenaTimeoutError";
  }
}

// Poll an Athena execution to a terminal state within a BOUNDED budget, then return (SUCCEEDED) or
// throw. Previously athenaQuery's inline loop ran a fixed 40×500ms and, if the query was still
// RUNNING, FELL THROUGH to GetQueryResults on an unfinished query → AWS InvalidRequestException
// (INVALID_QUERY_EXECUTION_STATE), a confusing 500 on a user's first uncached broad search. This never
// reads results off a non-SUCCEEDED query: past the budget it throws a clean AthenaTimeoutError.
// Budget is bounded by a max poll count (deadline/interval) so it's deterministic + offline-testable;
// `fetchState`/`sleep` are injected for the same reason. Default 30s (up from 20s) via ATHENA_MAX_WAIT_MS
// so a marginally-cold legitimate scan finishes, still well under the Vercel function ceiling.
export async function awaitAthenaDone(
  id: string,
  fetchState: () => Promise<{ state?: string; reason?: string }>,
  opts: { deadlineMs?: number; intervalMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<void> {
  const deadlineMs = opts.deadlineMs ?? Number(process.env.ATHENA_MAX_WAIT_MS ?? 30_000);
  const intervalMs = opts.intervalMs ?? 500;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxPolls = Math.max(1, Math.ceil(deadlineMs / intervalMs));
  for (let i = 0; i < maxPolls; i++) {
    const { state, reason } = await fetchState();
    if (state === "SUCCEEDED") return;
    if (state === "FAILED" || state === "CANCELLED") throw new Error(`athena: ${reason ?? state}`);
    if (i < maxPolls - 1) await sleep(intervalMs);
  }
  throw new AthenaTimeoutError(id, maxPolls * intervalMs);
}

// Run a query; `params` bind to `?` placeholders (injection-safe). Returns row objects.
export async function athenaQuery(sql: string, params: string[] = [], maxRows = 100): Promise<Record<string, string | null>[]> {
  if (!corpusEnabled()) return [];
  const c = client();
  const started = await c.send(new StartQueryExecutionCommand({
    QueryString: sql,
    QueryExecutionContext: { Database: DB },
    ResultConfiguration: { OutputLocation: OUTPUT },
    ExecutionParameters: params.length ? params : undefined,
    ResultReuseConfiguration: { ResultReuseByAgeConfiguration: { Enabled: true, MaxAgeInMinutes: 60 } },
  }));
  const id = started.QueryExecutionId!;
  // Bounded poll → SUCCEEDED or throw (never read results off a RUNNING query — see awaitAthenaDone).
  await awaitAthenaDone(id, async () => {
    const ex = await c.send(new GetQueryExecutionCommand({ QueryExecutionId: id }));
    return { state: ex.QueryExecution?.Status?.State, reason: ex.QueryExecution?.Status?.StateChangeReason };
  });
  const res = await c.send(new GetQueryResultsCommand({ QueryExecutionId: id, MaxResults: maxRows + 1 }));
  const rows = res.ResultSet?.Rows ?? [];
  if (rows.length < 1) return [];
  const header = (rows[0].Data ?? []).map((d) => d.VarCharValue ?? "");
  return rows.slice(1).map((r) => Object.fromEntries((r.Data ?? []).map((d, i) => [header[i], d.VarCharValue ?? null])));
}

const COURT_RE = /^[0-9]+_[0-9]+$/;
const IHCJ = "https://indian-high-court-judgments.s3.amazonaws.com";
const ISCJ = "https://indian-supreme-court-judgments.s3.amazonaws.com";

// Court code → friendly name (best-effort; falls back to the code). "SC" = Supreme Court.
export const COURT_NAMES: Record<string, string> = {
  SC: "Supreme Court", "24_17": "Gujarat HC", "19_16": "Calcutta HC", "16_20": "Madras HC", "1_12": "Bombay HC",
  "9_13": "Allahabad HC", "18_6": "Andhra/Telangana HC", "20_7": "Karnataka HC", "21_11": "Kerala HC",
};
export const courtLabel = (code?: string | null) => (code ? COURT_NAMES[code] ?? `Court ${code}` : "High Court");

// Resolve the open-data judgment PDF URL (HC vs SC buckets).
// HC pdf_link "court/cnrorders/<bench>/orders/<file>.pdf" → data/pdf/year/court/bench/<file>.
// SC path "2024_10_108_125" → data/pdf/year/english/<path>_EN.pdf.
export function judgmentPdfUrl(pdfLink?: string | null, court?: string | null, year?: string | null, src?: string | null): string | undefined {
  if (!pdfLink) return undefined;
  if (src === "SC") return year ? `${ISCJ}/data/pdf/year=${year}/english/${pdfLink}_EN.pdf` : undefined;
  const parts = pdfLink.split("/");
  const bench = parts.length >= 3 ? parts[2] : null;
  const file = parts[parts.length - 1];
  if (court && year && bench && file) return `${IHCJ}/data/pdf/year=${year}/court=${court}/bench=${bench}/${file}`;
  return `${IHCJ}/${pdfLink}`;
}

export interface JudgmentRow {
  src: string | null; cnr: string | null; title: string | null; judge: string | null; court: string | null;
  year: string | null; decision_date: string | null; disposal_nature: string | null; citation: string | null; pdf_link: string | null;
  // petitioner/respondent: present in judgments_all for HC rows; null for SC / older batches.
  petitioner: string | null; respondent: string | null;
}

const SELECT_COLS = "src, cnr, title, judge, court_code court, year, decision_date, disposal_nature, citation, path pdf_link, petitioner, respondent";
// The already-aliased columns of a `SELECT ${SELECT_COLS} … ` subquery (court_code→court, path→pdf_link),
// so an OUTER SELECT over that subquery references the projected names, not the raw table columns.
const OUTER_COLS = "src, cnr, title, judge, court, year, decision_date, disposal_nature, citation, pdf_link, petitioner, respondent";

// The fields that identify a DISTINCT judgment document. Exact-duplicate rows (overlapping partitions /
// re-ingested batches) collapse on this key. The page-local JS de-dupe (dedupeJudgments) and the SQL
// corpus queries (window de-dupe for the slice + DISTINCT for the count) MUST use the SAME key, or a
// paged slice and its "of N" total would disagree. Kept as one source of truth + asserted in tests.
// The two lists are parallel; they differ ONLY where a JudgmentRow field is aliased from its raw column.
export const DEDUP_KEY_FIELDS = ["cnr", "pdf_link", "title", "decision_date", "disposal_nature"] as const; // JudgmentRow field names
export const DEDUP_KEY_SQL_COLS = ["cnr", "path", "title", "decision_date", "disposal_nature"] as const;   // raw judgments_all columns (pdf_link→path)

// The corpus can return the same judgment more than once (overlapping partitions /
// re-ingested batches), which showed up as duplicate rows + a duplicate React key
// (CNR-keyed) in the research table. Collapse EXACT duplicates on the fields that
// identify a document — preserving genuinely distinct orders that share a CNR.
// Order-stable; pure (no I/O) so it's unit-testable offline. searchJudgments already
// de-dupes IN SQL (so the page slice agrees with countJudgments); this stays as a cheap
// page-local safety net for any path that doesn't.
export function dedupeJudgments(rows: JudgmentRow[]): JudgmentRow[] {
  const seen = new Set<string>();
  const out: JudgmentRow[] = [];
  for (const r of rows) {
    const key = DEDUP_KEY_FIELDS.map((f) => r[f] ?? "").join(" ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

export interface JudgmentFilter {
  q?: string; court?: string; year?: number; disposal?: string; judgeFilter?: string;
}

// Shared WHERE fragment + bound params for a judgment filter, used by BOTH the page slice
// (searchJudgments) and the total (countJudgments) so they always agree on what matches.
// court/year are validated + inlined (partition pruning); free-text / disposal / judge bind
// as `?` parameters — no user-controlled SQL. Returns "" (not "WHERE") when unfiltered.
function buildJudgmentFilter(opts: JudgmentFilter): { where: string; params: string[] } {
  const where: string[] = [];
  const params: string[] = [];
  if (opts.court === "SC") where.push("court_code = 'SC'");
  else if (opts.court && COURT_RE.test(opts.court)) where.push(`court_code = '${opts.court}'`);
  if (opts.year && Number.isInteger(opts.year)) where.push(`year = ${opts.year}`);
  // disposal_nature: equality filter; value comes from URL param validated in the page.
  if (opts.disposal) { where.push("lower(disposal_nature) = ?"); params.push(opts.disposal.toLowerCase()); }
  // judgeFilter: substring match (same style as q).
  if (opts.judgeFilter?.trim()) { where.push("lower(judge) LIKE ?"); params.push(`%${opts.judgeFilter.trim().toLowerCase()}%`); }
  const term = opts.q?.trim();
  if (term) { where.push("(lower(title) LIKE ? OR lower(judge) LIKE ? OR lower(cnr) LIKE ? OR lower(citation) LIKE ?)"); const p = `%${term.toLowerCase()}%`; params.push(p, p, p, p); }
  return { where: where.length ? "WHERE " + where.join(" AND ") : "", params };
}

// Full-corpus judgment search across ALL High Courts + the Supreme Court (judgments_all).
// Page-sliced (offset + limit) so callers can paginate past the first page; pair with
// countJudgments() for the total. Exact duplicates are collapsed IN SQL (row_number()=1 over
// DEDUP_KEY_SQL_COLS) so a slice and the count agree on de-dupe — the JS dedupeJudgments below
// is then a cheap no-op safety net that keeps existing callers/tests unchanged.
export async function searchJudgments(
  opts: JudgmentFilter & { limit?: number; offset?: number },
): Promise<JudgmentRow[]> {
  const { where, params } = buildJudgmentFilter(opts);
  const limit = Math.min(Math.max(1, opts.limit ?? 100), 200);
  const offset = Math.max(0, Math.trunc(opts.offset ?? 0));
  const sql = `SELECT ${OUTER_COLS} FROM (
      SELECT ${SELECT_COLS}, row_number() OVER (PARTITION BY ${DEDUP_KEY_SQL_COLS.join(", ")} ORDER BY decision_date DESC) rn
      FROM judgments_all ${where}
    ) WHERE rn = 1
    ORDER BY decision_date DESC${offset ? ` OFFSET ${offset}` : ""} LIMIT ${limit}`;
  return dedupeJudgments((await athenaQuery(sql, params, limit)) as unknown as JudgmentRow[]);
}

// Honest total for the SAME filter — the number of DISTINCT documents searchJudgments would page over
// (de-duped on DEDUP_KEY_SQL_COLS, matching the window de-dupe), so the numbered pager's "of N" is real
// and not the old silent "100+". One extra Athena scan; run it in parallel with the page fetch.
export async function countJudgments(opts: JudgmentFilter): Promise<number> {
  const { where, params } = buildJudgmentFilter(opts);
  const sql = `SELECT count(*) n FROM (
      SELECT DISTINCT ${DEDUP_KEY_SQL_COLS.join(", ")} FROM judgments_all ${where}
    )`;
  const rows = await athenaQuery(sql, params, 1);
  return Number(rows[0]?.n ?? 0) || 0;
}

export interface CaseDetail {
  case_type: string | null; pet_advocate: string | null; res_advocate: string | null;
  fir_no: string | null; fir_year: string | null; lower_court: string | null; acts: string | null;
}

// Rich case detail (advocates, acts/sections, FIR) for a CNR, from the open
// parquet_case_details (currently a few High Courts; grows). Null when not present.
export async function caseDetailByCnr(cnr?: string | null): Promise<CaseDetail | null> {
  if (!cnr) return null;
  const sql = `SELECT case_type, pet_advocate, res_advocate, fir_no, fir_year, lower_court,
    array_join(transform(acts, x -> concat(coalesce(x.act,''), ' ', coalesce(x.section,''))), '; ') acts
    FROM case_details WHERE cnr = ? LIMIT 1`;
  const rows = await athenaQuery(sql, [cnr], 1);
  return (rows[0] as unknown as CaseDetail) ?? null;
}

export interface AdvocateCaseRow {
  cnr: string | null; pet_advocate: string | null; res_advocate: string | null; case_type: string | null;
  title: string | null; court: string | null; year: string | null; decision_date: string | null;
  disposal_nature: string | null; pdf_link: string | null; src: string | null;
}

// Closed cases + judgments for an advocate, from the open parquet_case_details
// (joined to judgments_all on CNR for the order PDF). Compliance note: the corpus
// has the advocate NAME, not the bar number, and coverage is partial (the HCs/SC
// we've ingested) — surface that caveat. Matches either side's advocate field.
export async function searchCasesByAdvocate(name: string, limit = 50): Promise<AdvocateCaseRow[]> {
  const n = name?.trim();
  if (!n || n.length < 3) return [];
  const p = `%${n.toLowerCase()}%`;
  const sql = `SELECT cd.cnr, cd.pet_advocate, cd.res_advocate, cd.case_type,
      j.title, j.court_code court, j.year, j.decision_date, j.disposal_nature, j.path pdf_link, j.src
    FROM case_details cd
    LEFT JOIN judgments_all j ON j.cnr = cd.cnr
    WHERE lower(cd.pet_advocate) LIKE ? OR lower(cd.res_advocate) LIKE ?
    ORDER BY j.decision_date DESC LIMIT ${Math.min(limit, 200)}`;
  return (await athenaQuery(sql, [p, p], limit)) as unknown as AdvocateCaseRow[];
}

// Precedent for the agent: judgments matching any of the given terms (party/judge), HC + SC.
export async function searchJudgmentsByTerms(terms: string[], limit = 4): Promise<JudgmentRow[]> {
  const clean = [...new Set(terms.filter((t) => t && t.length > 4))].slice(0, 3);
  if (!clean.length) return [];
  const ors = clean.map(() => "lower(title) LIKE ?").join(" OR ");
  const params = clean.map((t) => `%${t.toLowerCase()}%`);
  const sql = `SELECT ${SELECT_COLS} FROM judgments_all WHERE ${ors} ORDER BY decision_date DESC LIMIT ${Math.min(limit, 10)}`;
  return (await athenaQuery(sql, params, limit)) as unknown as JudgmentRow[];
}
