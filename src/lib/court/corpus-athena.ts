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
  for (let i = 0; i < 40; i++) {
    const ex = await c.send(new GetQueryExecutionCommand({ QueryExecutionId: id }));
    const st = ex.QueryExecution?.Status?.State;
    if (st === "SUCCEEDED") break;
    if (st === "FAILED" || st === "CANCELLED") throw new Error(`athena: ${ex.QueryExecution?.Status?.StateChangeReason ?? st}`);
    await new Promise((r) => setTimeout(r, 500));
  }
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
}

const SELECT_COLS = "src, cnr, title, judge, court_code court, year, decision_date, disposal_nature, citation, path pdf_link";

// Full-corpus judgment search across ALL High Courts + the Supreme Court (judgments_all).
// court/year validated + inlined (partition pruning); free-text binds as parameters.
export async function searchJudgments(opts: { q?: string; court?: string; year?: number; limit?: number }): Promise<JudgmentRow[]> {
  const where: string[] = [];
  const params: string[] = [];
  if (opts.court === "SC") where.push("court_code = 'SC'");
  else if (opts.court && COURT_RE.test(opts.court)) where.push(`court_code = '${opts.court}'`);
  if (opts.year && Number.isInteger(opts.year)) where.push(`year = ${opts.year}`);
  const term = opts.q?.trim();
  if (term) { where.push("(lower(title) LIKE ? OR lower(judge) LIKE ? OR lower(cnr) LIKE ? OR lower(citation) LIKE ?)"); const p = `%${term.toLowerCase()}%`; params.push(p, p, p, p); }
  const sql = `SELECT ${SELECT_COLS} FROM judgments_all ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY decision_date DESC LIMIT ${Math.min(opts.limit ?? 100, 200)}`;
  return (await athenaQuery(sql, params, opts.limit ?? 100)) as unknown as JudgmentRow[];
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
