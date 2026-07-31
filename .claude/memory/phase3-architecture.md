---
name: phase3-architecture
description: "Phase 3 services are a modular monolith (env-switched modules), not separate runtimes; what's keyless vs gated"
metadata: 
  node_type: memory
  type: project
  originSessionId: 01576ca6-b548-4a76-8884-dbb260336242
---

Phase 3 ("platform") added a Court Data Gateway + Messaging/Voice/Lawyer-Agent services. Decision (see `docs/decisions/2026-06-25-phase3-architecture.md`): build each "service" as a module under `src/lib/services/<name>/` (or `src/lib/court/`) behind a versioned interface + mock + live impl, **env-switched** — same seam as `CourtDataClient`/`MailClient`. NOT separate runtimes (over-engineering for solo-dev/keyless/Vercel); tables are namespaced (`court_*`, `msg_*`, `voice_*`, `agent_*`) so extraction later is lift-and-shift.

**Why:** the brief suggested decoupled services but explicitly granted latitude (§F/§J). The seam is what matters, not the process boundary.

**Shipped keyless:** Court Data Gateway v1 (shared `court_cache` read-through, service-role only, stale-on-error fallback), client-first document library + content-hash dedup, case console (search/filter/sort + saved views), similar-case discovery (GIN arrays on matter: party/advocate/judge/act), **Lawyer Agent** (grounded retrieval over matter corpus + seeded `legal_reference` KB = IPC/CrPC/Evidence↔BNS/BNSS/BSA + NI-138 + limitation; cite-or-abstain; synthesis via `completeJson` router, async queue-to-worker on keyless prod via `agent_turn.meta.pending`). Migrations 0010 + 0011.

**Gated (built behind seam, mock/manual now):** WhatsApp BSP, cloud telephony (Exotel/Knowlarity), Indic STT (Sarvam/AI4Bharat), Indian Kanoon API, embeddings/pgvector RAG (`document_chunk` + FTS works now), multi-provider court routing (Vakeel360/kanoon.dev). All keys in `.env.example`.

**Resolved 2026-07-30 (WO-311):** messaging/voice webhooks no longer guess a tenant. Inbound routes on the RECEIVING identity (WhatsApp `phone_number_id` / telephony DID) via the `messaging_identity` mapping; an unmapped identity writes nothing, returns 200, records a `court_provider_health` row and alerts. Both webhooks now verify a signature or hard-refuse.

Related: [[classifier-local-claude-cli]], [[court-data-own-datastore-direction]], [[deployment-vercel]].
