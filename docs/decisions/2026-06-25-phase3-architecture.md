# Phase 3 — Architecture decision & build plan

_Date: 2026-06-25. Status: accepted (build in progress). Supersedes nothing; extends the Phase 1–2 seams._

## The decision: modular monolith, contract-first (not separate runtimes — yet)

Phase 3's brief frames seven capabilities and suggests **decoupling** messaging, voice, court-data,
and the agent into services. We validated that intent against the actual repo and made this call:

> **Build each "service" as a module under `src/lib/services/<name>/` behind a versioned TypeScript
> contract, with a mock + a live implementation selected by an env switch — the same seam pattern
> already proven by `CourtDataClient`, `MailClient`, and the classifier router. Do NOT stand up
> separate runtimes/hosts now.**

### Why
- **The seam is what matters, not the process boundary.** A clean contract + mock/live split gives
  us swap-ability, testability, and a later lift-and-shift to a separate runtime — without paying
  ops/latency/cost of microservices on a solo-dev, keyless, Vercel-Hobby footprint today.
- **The brief grants this latitude** (§F "extract only what has a distinct scaling/latency/
  compliance profile… don't over-split"; §J "the session owns the exact service boundaries and
  runtimes").
- **It matches what already works.** Court/mail/classifier are already env-switched mock↔live.

### How we keep it honestly extractable
1. **Namespaced tables** per service (`court_*`, `msg_*`, `voice_*`, `agent_*`) so a future extract
   maps cleanly to a service-owned schema.
2. **All access through the contract** — pages/route-handlers call the service interface, never the
   service's tables directly.
3. **Documented extraction trigger** per service (below): the concrete signal that says "now make
   it a real service."
4. **Tenant context + provenance carried in every contract method** (tenantId arg + `source`/
   `fetchedAt` on every result), so an out-of-process version propagates it over the wire unchanged.

| Service (module) | Extraction trigger |
|---|---|
| Court Data Gateway | Sustained cross-tenant fetch volume that needs its own rate-limit budget + a long-running refresh queue. |
| Messaging Gateway | WhatsApp webhook throughput / 24h-session state that shouldn't share request capacity with the app. |
| Voice/Call Service | Media + STT pipeline (CPU/GPU, long jobs) — extract as soon as real audio volume arrives. |
| AI/Agent Service | When RAG embeddings + tool-orchestration latency justify a dedicated inference host. |
| Search | Only when Postgres FTS/trigram facets stop scaling (promote to Typesense/Meilisearch). |

## Service map (modules, contracts, status)

```
src/lib/services/
  court/      CourtGateway   — read-through cache + provider registry + HITL refresh   [E7]  ✅ keyless
  messaging/  MessagingGateway — channels (whatsapp|email), in/out, classify-to-matter [E1]  contract+mock; live gated
  voice/      VoiceService   — ingest(upload|telephony) → STT → summary, tag-by-number  [E5]  manual path keyless; STT gated
  agent/      AgentService   — grounded Lawyer Agent: retrieve→answer→cite; KB pack     [E6]  keyword-RAG keyless; pgvector+IK gated
```
In-app (monolith, no service): client-first documents (E2), case console search/filter (E3),
rich case detail + similar-case (E4), and every in-product surface that calls the services.

## Hard lines (carried verbatim from Part A)
- **No automated CAPTCHA solving / no headless bot-scraping** of eCourts. Resilience = own cache +
  multi-provider routing + **human-in-the-loop** refresh (the *user* solves any CAPTCHA on the
  official portal; we parse the returned page into cache). Implemented as `court_refresh_request`.
- **AI is assistive**: insights/summaries/extracted-deadlines/drafts are suggestions a human
  confirms — labelled, cited where possible, "not legal advice". The agent **grounds** answers in
  retrieved sources and **abstains** when retrieval is empty. Handles **both** old (IPC/CrPC/
  Evidence Act) and new (BNS/BNSS/BSA) law via a maintained `legal_reference` knowledge pack.
- **Voice**: record only with disclosed consent (one-party + DPDP); cloud-telephony for the auto
  path, manual upload as fallback; audio encrypted; transcript treated as PII.
- **PII everywhere**: DPDP-aligned consent, RLS on every tenant table, encryption, audit;
  tenant context propagated across every contract hop.

## Sequencing (this is the build order; §H of the brief, validated)
1. **Tier-1 in-app, keyless** — E7-v1 court cache → E2 client-first documents → E3 case console
   → E4 rich detail + similar-case. *These unblock daily use and cut API spend.* ← **building now**
2. **Messaging Gateway** — contract + `msg_message` + mock + inbound-classify; live WhatsApp BSP gated.
3. **AI/Agent** — formalize basic insights behind `AgentService`; grounded Lawyer Agent with the
   `legal_reference` KB + keyword retrieval over the matter corpus (keyless); pgvector + Indian
   Kanoon gated.
4. **Court Data Gateway v2** — multi-provider routing + failover + HITL refresh UI.
5. **Voice** — manual upload + tag-by-client (keyless) now; telephony + Indic STT + mobile app gated.

## What's gated (needs a key/account — built behind the seam, mock/manual now)
WhatsApp BSP · cloud telephony (Exotel/Knowlarity) · Indic STT (Sarvam/AI4Bharat/Whisper) ·
Indian Kanoon API · embeddings provider (pgvector RAG) · multi-provider court APIs (Vakeel360/
kanoon.dev). All keys enumerated in `.env.example`; all live paths flip on when the key appears.

## Data-model additions
- **0010 (Tier-1):** `court_cache`, `court_provider_health`, `court_refresh_request`; `matter`
  detail columns (`detail` jsonb + denormalized `party_names/advocate_names/judge_names/act_names`
  arrays for similarity) + `court_order`; `document.content_hash` (dedup); `saved_view`.
- **0011 (services):** `msg_message`; `voice_recording`; `agent_thread`/`agent_turn`;
  `legal_reference` (KB pack, seeded); `document_chunk` (retrieval; embedding column added when a
  provider is chosen).
Every tenant-owned table gets its 4 RLS policies keyed to `current_tenant_id()`. `court_cache`/
`court_provider_health`/`legal_reference` are shared/global (RLS on, no public write — service-role
only; `legal_reference` readable by authenticated users).
