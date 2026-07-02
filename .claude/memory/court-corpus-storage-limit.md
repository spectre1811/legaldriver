---
name: court-corpus-storage-limit
description: "The court-judgments corpus exceeds Supabase Free's ~500MB disk; keep it small or move it off the app DB"
metadata: 
  node_type: memory
  type: project
  originSessionId: 01576ca6-b548-4a76-8884-dbb260336242
---

The Gujarat/all-India court-judgments corpus (`corpus_judgment`, from the AWS Open Data "Indian High Court Judgments" CC-BY bucket via `scripts/ingest-ihcj.ts`) is LARGE: 605k rows ≈ 775 MB with its text/trgm/fts indexes; full multi-court/all-years ambition = millions of rows = several GB.

**It does not fit Supabase Free (~500 MB disk).** On 2026-06-28, loading 605k rows filled the disk and put the whole project into **read-only mode** → the live app couldn't write (brief outage). Recovery: `POST /v1/projects/<ref>/readonly/temporary-disable` (it engaged after an instance restart; status flips `enabled:false`), then `TRUNCATE corpus_judgment, corpus_source_batch, corpus_ingest_watermark` → DB back to 15 MB → writes restored. Then reloaded only **Gujarat 2025 (~7.5k rows, DB ~37 MB)** as a safe demo slice.

**RESOLVED (2026-06-29):** the corpus now lives in an **S3 + Athena lake** (the user's AWS, ap-south-1), NOT Supabase. Bucket `legaldriver-corpus-872253065260` mirrors all 25 High Courts' judgment metadata as Parquet (`scripts/mirror-ihcj.sh`, ~7.6 GB, ~$0.18/mo); Glue table `legaldriver_corpus.hc_judgments` (partition projection court/year) → **18.5M judgments**, queried via `src/lib/court/corpus-athena.ts` (parameterized, result-reuse cache). A **scoped read-only IAM user `legaldriver-app`** (Athena + S3 read on our bucket) is in Vercel env (`CORPUS_AWS_*`, `ATHENA_*`) + local `.env`. The Case Research page + Lawyer-Agent precedent both query Athena. **Do NOT re-run `scripts/ingest-ihcj.ts` (the old Supabase loader) — it bloats the app DB; the Supabase `corpus_*` tables are deprecated** (a tiny Gujarat slice remains, harmless). Related: [[deployment-vercel]], [[phase3-architecture]].
