// Ingest High Court judgments from the AWS Open Data "Indian High Court Judgments"
// bucket (CC-BY-4.0, no auth, NO CAPTCHA) into corpus_judgment. COMPLIANT: we consume
// the published open mirror; we never run its upstream scraper or touch eCourts.
//
//   npx tsx scripts/ingest-ihcj.ts 2025 2024            # default: Gujarat (24_17)
//   npx tsx scripts/ingest-ihcj.ts --courts=all 2025    # ALL High Courts for 2025
//   npx tsx scripts/ingest-ihcj.ts --courts=16_20,1_12 2025
//
// Per partition (year/court/bench): download metadata.parquet → DuckDB dumps the
// needed columns to JSON → parse (case number, parties, state) → idempotent upsert.
import { readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

for (const l of readFileSync(".env", "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

const BUCKET = "indian-high-court-judgments";
const SOURCE = "aws-ihcj";
const DUCKDB = process.env.DUCKDB_BIN || "/tmp/gjhc/duckdb";
const TMP = "/tmp/gjhc";

const toIso = (s: string | null): string | null => {
  if (!s) return null;
  const m = String(s).match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = String(s).match(/^(\d{4}-\d{2}-\d{2})/);
  return d ? d[1] : null;
};
const stateOf = (court: string | null): string | null =>
  court ? court.replace(/^high court (of|at|for)\s+/i, "").replace(/\s+at\s+.*/i, "").trim() || null : null;

function parseTitle(title: string | null): { caseNumber: string | null; petitioner: string | null; respondent: string | null } {
  if (!title) return { caseNumber: null, petitioner: null, respondent: null };
  const ofIdx = title.indexOf(" of ");
  const caseNumber = ofIdx > 0 ? title.slice(0, ofIdx).trim() : null;
  const rest = ofIdx > 0 ? title.slice(ofIdx + 4) : title;
  const parts = rest.split(/\s+(?:Vs\.?|Versus|V\/s)\s+/i);
  const clip = (s?: string) => (s ? s.trim().replace(/\s+/g, " ").slice(0, 300) : null);
  return { caseNumber, petitioner: clip(parts[0]), respondent: clip(parts[1]) };
}

type Raw = { court_code?: string; title?: string; judge?: string; pdf_link?: string; cnr?: string; date_of_registration?: string; decision_date?: string; disposal_nature?: string; court?: string };

// List every metadata.parquet key for a year in one recursive ls, filtered by court spec.
function partitionsForYear(year: string, courts: string[] | "all"): { key: string; courtCode: string; partition: string }[] {
  let ls = "";
  try { ls = execFileSync("aws", ["s3", "ls", `s3://${BUCKET}/metadata/parquet/year=${year}/`, "--no-sign-request", "--recursive"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }); }
  catch { return []; }
  const out: { key: string; courtCode: string; partition: string }[] = [];
  for (const line of ls.split("\n")) {
    const key = line.trim().split(/\s+/).pop() ?? "";
    if (!key.endsWith("metadata.parquet")) continue;
    const cm = key.match(/court=([^/]+)\/bench=([^/]+)\//);
    if (!cm) continue;
    const courtCode = cm[1];
    if (courts !== "all" && !courts.includes(courtCode)) continue;
    out.push({ key, courtCode, partition: key.replace("metadata/parquet/", "").replace("/metadata.parquet", "") });
  }
  return out;
}

async function main() {
  if (!existsSync(DUCKDB)) { console.error(`duckdb not found at ${DUCKDB} (set DUCKDB_BIN)`); process.exit(1); }
  mkdirSync(TMP, { recursive: true });
  const { createAdminClient } = await import("../src/lib/supabase/admin");
  const admin = createAdminClient();

  const args = process.argv.slice(2);
  const years = args.filter((a) => /^\d{4}$/.test(a));
  const courtsArg = args.find((a) => a.startsWith("--courts="))?.split("=")[1];
  const courts: string[] | "all" = !courtsArg ? ["24_17"] : courtsArg === "all" ? "all" : courtsArg.split(",");
  if (!years.length) { console.error("pass year(s); optional --courts=all|24_17,16_20"); process.exit(1); }

  for (const year of years) {
    const parts = partitionsForYear(year, courts);
    console.log(`\n### year ${year}: ${parts.length} partition(s)`);
    for (const { key, courtCode, partition } of parts) {
      const pq = `${TMP}/p.parquet`;
      const out = `${TMP}/p.json`;
      try { execFileSync("aws", ["s3", "cp", `s3://${BUCKET}/${key}`, pq, "--no-sign-request"], { stdio: "pipe" }); }
      catch { console.log(`  ${partition}: download failed (skip)`); continue; }
      execFileSync(DUCKDB, ["-c",
        `COPY (SELECT court_code, title, judge, pdf_link, cnr, date_of_registration, CAST(decision_date AS DATE)::VARCHAR AS decision_date, disposal_nature, court FROM read_parquet('${pq}')) TO '${out}' (FORMAT JSON, ARRAY true);`,
      ], { stdio: "pipe" });
      const rows = JSON.parse(readFileSync(out, "utf8")) as Raw[];
      const { data: batch } = await admin.from("corpus_source_batch").insert({ source: SOURCE, partition, rows_seen: rows.length }).select("id").single();

      const mapped = rows.filter((r) => r.pdf_link).map((r) => {
        const t = parseTitle(r.title ?? null);
        return {
          source: SOURCE, license: "CC-BY-4.0", state: stateOf(r.court ?? null),
          court_code: r.court_code ?? courtCode, court: r.court ?? null,
          cnr: r.cnr ?? null, case_number: t.caseNumber, title: r.title ?? null,
          petitioner: t.petitioner, respondent: t.respondent, judge: r.judge ?? null,
          year: Number(year), registration_date: toIso(r.date_of_registration ?? null),
          decision_date: toIso(r.decision_date ?? null), disposal_nature: r.disposal_nature ?? null,
          pdf_link: r.pdf_link!, content_hash: createHash("sha256").update(r.pdf_link!).digest("hex"),
        };
      });
      let upserted = 0;
      for (let i = 0; i < mapped.length; i += 500) {
        const { error } = await admin.from("corpus_judgment").upsert(mapped.slice(i, i + 500), { onConflict: "pdf_link" });
        if (error) { console.error(`  ${partition} upsert err @${i}: ${error.message}`); break; }
        upserted += Math.min(500, mapped.length - i);
      }
      console.log(`  ${partition}: seen=${rows.length} upserted=${upserted}`);
      if (batch?.id) await admin.from("corpus_source_batch").update({ rows_upserted: upserted, finished_at: new Date().toISOString() }).eq("id", batch.id);
      await admin.from("corpus_ingest_watermark").upsert({ source: SOURCE, partition, last_ingested_at: new Date().toISOString(), rows: upserted }, { onConflict: "source,partition" });
    }
  }
  rmSync(`${TMP}/p.parquet`, { force: true }); rmSync(`${TMP}/p.json`, { force: true });
  const { count } = await admin.from("corpus_judgment").select("*", { count: "exact", head: true });
  console.log(`\ncorpus_judgment total rows: ${count}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
