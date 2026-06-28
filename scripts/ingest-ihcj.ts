// Ingest Gujarat High Court judgments from the AWS Open Data "Indian High Court
// Judgments" bucket (CC-BY-4.0, no auth, NO CAPTCHA) into corpus_judgment.
// COMPLIANT: we consume the published open mirror; we never run its upstream scraper.
//
//   Usage: npx tsx scripts/ingest-ihcj.ts 2023 2024 2025
//
// Per year: download the partition's metadata.parquet → DuckDB dumps the needed
// columns to JSON → parse (case number, parties) → idempotent upsert on pdf_link.
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

for (const l of readFileSync(".env", "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

const BUCKET = "indian-high-court-judgments";
const COURT = "court=24_17/bench=gujarathc"; // Gujarat High Court
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

// "CR.RA/952/2023 of ARTHKUMAR ... Vs BINALBEN ..." → {caseNumber, petitioner, respondent}
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

async function main() {
  if (!existsSync(DUCKDB)) { console.error(`duckdb not found at ${DUCKDB} (set DUCKDB_BIN)`); process.exit(1); }
  mkdirSync(TMP, { recursive: true });
  const { createAdminClient } = await import("../src/lib/supabase/admin");
  const admin = createAdminClient();

  const years = process.argv.slice(2).filter((a) => /^\d{4}$/.test(a));
  if (!years.length) { console.error("pass year(s), e.g. 2023 2024"); process.exit(1); }

  for (const year of years) {
    const partition = `year=${year}/${COURT}`;
    const s3 = `s3://${BUCKET}/metadata/parquet/${partition}/metadata.parquet`;
    const pq = `${TMP}/${year}.parquet`;
    const out = `${TMP}/${year}.json`;
    console.log(`\n=== ${year} :: ${partition} ===`);
    try { execFileSync("aws", ["s3", "cp", s3, pq, "--no-sign-request"], { stdio: "pipe" }); }
    catch { console.log(`  no partition for ${year} (skip)`); continue; }

    // DuckDB: dump the needed columns (skip the huge raw_html/description) as a JSON array.
    execFileSync(DUCKDB, ["-c",
      `COPY (SELECT court_code, title, judge, pdf_link, cnr, date_of_registration, CAST(decision_date AS DATE)::VARCHAR AS decision_date, disposal_nature, court FROM read_parquet('${pq}')) TO '${out}' (FORMAT JSON, ARRAY true);`,
    ], { stdio: "pipe" });

    const rows = JSON.parse(readFileSync(out, "utf8")) as Raw[];
    const { data: batch } = await admin.from("corpus_source_batch").insert({ source: SOURCE, partition, rows_seen: rows.length }).select("id").single();

    const mapped = rows
      .filter((r) => r.pdf_link)
      .map((r) => {
        const t = parseTitle(r.title ?? null);
        return {
          source: SOURCE, license: "CC-BY-4.0", state: "Gujarat",
          court_code: r.court_code ?? null, court: r.court ?? "High Court of Gujarat",
          cnr: r.cnr ?? null, case_number: t.caseNumber, title: r.title ?? null,
          petitioner: t.petitioner, respondent: t.respondent, judge: r.judge ?? null,
          year: Number(year), registration_date: toIso(r.date_of_registration ?? null),
          decision_date: toIso(r.decision_date ?? null), disposal_nature: r.disposal_nature ?? null,
          pdf_link: r.pdf_link!, content_hash: createHash("sha256").update(r.pdf_link!).digest("hex"),
        };
      });

    let upserted = 0;
    for (let i = 0; i < mapped.length; i += 500) {
      const chunk = mapped.slice(i, i + 500);
      const { error } = await admin.from("corpus_judgment").upsert(chunk, { onConflict: "pdf_link" });
      if (error) { console.error(`  upsert error @${i}: ${error.message}`); break; }
      upserted += chunk.length;
      process.stdout.write(`  upserted ${upserted}/${mapped.length}\r`);
    }
    console.log(`\n  done ${year}: seen=${rows.length} upserted=${upserted}`);
    if (batch?.id) await admin.from("corpus_source_batch").update({ rows_upserted: upserted, finished_at: new Date().toISOString() }).eq("id", batch.id);
    await admin.from("corpus_ingest_watermark").upsert({ source: SOURCE, partition, last_ingested_at: new Date().toISOString(), rows: upserted }, { onConflict: "source,partition" });
  }

  const { count } = await admin.from("corpus_judgment").select("*", { count: "exact", head: true });
  console.log(`\ncorpus_judgment total rows: ${count}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
