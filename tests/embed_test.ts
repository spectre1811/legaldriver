// Smoke test: local embeddings (bge-small via transformers.js) + pgvector match RPC.
// Run: set -a; source .env; set +a; npx tsx tests/embed_test.ts
import { createAdminClient } from "@/lib/supabase/admin";
import { embedPassage, embedQuery, toVectorLiteral } from "@/lib/services/agent/embed";

async function main() {
  const admin = createAdminClient();
  const { data: t } = await admin.from("tenant").select("id").limit(1).maybeSingle();
  if (!t) { console.log("no tenant — skip"); process.exit(0); }
  const tenantId = t.id;

  const p = await embedPassage("A demand notice under section 138 of the NI Act was issued after the cheque was dishonoured.");
  console.log("passage dims:", p.length);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: chunk, error } = await admin.from("document_chunk").insert({ tenant_id: tenantId, content: "Statutory demand notice for a bounced cheque under NI Act 138.", chunk_index: 0, embedding: toVectorLiteral(p) as any }).select("id").single();
  if (error || !chunk) { console.error("chunk insert err:", error?.message); process.exit(1); }

  const q = await embedQuery("cheque bounce notice timeline");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: matches, error: rpcErr } = await admin.rpc("match_document_chunks", { p_tenant: tenantId, p_embedding: toVectorLiteral(q), p_k: 3 } as any);
  if (rpcErr) console.error("rpc err:", rpcErr.message);
  console.log("matches:", JSON.stringify(matches));

  await admin.from("document_chunk").delete().eq("id", chunk.id);

  const top = (matches as { similarity: number }[] | null)?.[0];
  const ok = p.length === 384 && !!top && top.similarity > 0.3;
  console.log(ok ? "EMBED TEST: PASS" : "EMBED TEST: WEAK/FAIL");
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
