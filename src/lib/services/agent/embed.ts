// WORKER-ONLY. Local sentence embeddings via transformers.js (bge-small-en-v1.5,
// 384-dim) — no API key, runs in Node on the worker box. DO NOT import this from
// any Next page/route: it pulls onnxruntime-node and must never reach the Vercel
// bundle. Only scripts/classify-worker.ts imports it.

type Extractor = (text: string, opts: { pooling: string; normalize: boolean }) => Promise<{ data: Float32Array }>;
let extractor: Extractor | null = null;
const MODEL = process.env.EMBED_MODEL ?? "Xenova/bge-small-en-v1.5";

async function getEmbedder(): Promise<Extractor> {
  if (!extractor) {
    const { pipeline } = await import("@xenova/transformers");
    extractor = (await pipeline("feature-extraction", MODEL)) as unknown as Extractor;
  }
  return extractor;
}

async function run(text: string): Promise<number[]> {
  const ex = await getEmbedder();
  const out = await ex(text.slice(0, 4000), { pooling: "mean", normalize: true });
  return Array.from(out.data);
}

// bge retrieval convention: passages embedded as-is; queries get an instruction.
export const embedPassage = (text: string) => run(text);
export const embedQuery = (text: string) => run(`Represent this sentence for searching relevant passages: ${text}`);

// pgvector text literal for an embedding (insert value or RPC param).
export const toVectorLiteral = (v: number[]) => `[${v.join(",")}]`;

// Split text into ~maxLen-char windows on paragraph/sentence-ish boundaries.
export function chunkText(text: string, maxLen = 1200): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return clean ? [clean] : [];
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(i + maxLen, clean.length);
    if (end < clean.length) {
      const dot = clean.lastIndexOf(". ", end);
      if (dot > i + maxLen * 0.5) end = dot + 1;
    }
    chunks.push(clean.slice(i, end).trim());
    i = end;
  }
  return chunks.filter(Boolean);
}
