import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { extractText } from "@/lib/docs/extract";

// On-demand judgment full-text. Fetches the open-data PDF, extracts text (unpdf),
// and caches the result in our S3 lake (judgment-text/) so repeats are instant.
// We never bulk-process the 1.25 TiB of PDFs — only the judgments a user actually opens.

const REGION = process.env.CORPUS_AWS_REGION ?? "ap-south-1";
const BUCKET = process.env.CORPUS_BUCKET;

let _s3: S3Client | null = null;
function s3(): S3Client {
  if (!_s3) _s3 = new S3Client({ region: REGION, credentials: { accessKeyId: process.env.CORPUS_AWS_ACCESS_KEY_ID!, secretAccessKey: process.env.CORPUS_AWS_SECRET_ACCESS_KEY! } });
  return _s3;
}

const safeKey = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 200);

export interface JudgmentText {
  text: string;
  cached: boolean;
  needsOcr?: boolean;
}

export async function getJudgmentText(opts: { pdfUrl?: string | null; cacheKey: string }): Promise<JudgmentText | null> {
  if (!BUCKET || !opts.pdfUrl) return null;
  const key = `judgment-text/${safeKey(opts.cacheKey)}.txt`;

  // 1) cache hit
  try {
    const got = await s3().send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const text = (await got.Body?.transformToString()) ?? "";
    if (text) return { text, cached: true };
  } catch { /* miss → extract */ }

  // 2) fetch the open PDF + extract
  try {
    const res = await fetch(opts.pdfUrl);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const { text, needsOcr } = await extractText(buf, "application/pdf", "judgment.pdf");
    const out = (text ?? "").trim();
    if (out) {
      try { await s3().send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: out, ContentType: "text/plain; charset=utf-8" })); } catch { /* cache best-effort */ }
    }
    return { text: out, cached: false, needsOcr };
  } catch {
    return null;
  }
}
