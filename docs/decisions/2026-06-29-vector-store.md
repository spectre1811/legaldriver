# Vector store decision

**Decision: Supabase pgvector (already in-stack), for BOUNDED embedding workloads.**

## Why
We compared Supabase pgvector vs AWS OpenSearch vs a self-hosted pgvector box for the
app's semantic needs (RAG over a tenant's documents, drafting source docs, and the
*opened/relevant* judgments — NOT the full 18.6M corpus).

| Option | Cost | Ops | Fit |
|---|---|---|---|
| **Supabase pgvector** ✅ | **$0** (free tier, bounded) | trivial — already in the stack, same client, RLS, types | Best for bounded vectors next to tenant data (SQL joins, RLS isolation) |
| OpenSearch (AWS) | ~$25–50/mo min cluster (Serverless has a high floor) | a second system to run/secure | Overkill + cost for our volume |
| pgvector box (worker) | $0 | needs inbound exposure of the box → security/ops | Conflicts with the outbound-only worker design |

pgvector is already enabled (migration 0012, `document_chunk.embedding vector(384)`,
local bge-small embeddings on the worker). It's the cheapest, easiest, lowest-risk choice
and keeps vectors RLS-isolated alongside tenant data.

## The bound (important — avoids the read-only incident recurring)
We embed only **bounded, usage-driven** sets:
- a tenant's own **documents** (dozens–hundreds each),
- **drafting source documents**,
- **opened/relevant judgments** (a capped cache).
384-dim vectors are ~1.5 KB each; even 100k vectors ≈ ~150 MB + index → fits free tier.

## Explicitly NOT in pgvector
The full **18.6M-judgment corpus** is NOT embedded — it stays in **S3 + Athena** (keyword
search + partition projection + on-demand full-text). Embedding all of it would need a
scaled store. **Revisit OpenSearch / a dedicated pgvector box ONLY if/when full-corpus
semantic search becomes a requirement** — that's a separate, funded decision.
