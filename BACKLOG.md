# Legaldriver — Backlog Dashboard

_Last updated: 2026-06-25 (post Phase-3). Source of truth for what's **not** yet shipped. Shipped work is in `TASKBOARD.md` / git history._

**Legend:** 🟢 ready (keyless — I can build now) · 🟡 needs a decision · 🔴 blocked on a key/account · 🔵 deferred (later)

## Phase 3 shipped (this round) ✅
Court Data Gateway v1 (shared cache + provider-health + richer normalization) · client-first
document library + dedup · case console (search/filter/sort + saved views) · rich case detail +
similar-case discovery · **Lawyer Agent** (grounded + cited, BNS/BNSS/BSA↔IPC/CrPC/Evidence KB,
keyless via worker) + Copilot UI · Messaging Gateway (mock; BSP gated) · Voice service (manual
upload; telephony/STT gated). Architecture: `docs/decisions/2026-06-25-phase3-architecture.md`.

### New Phase-3 follow-ups
- 🟢 **pgvector RAG**: `document_chunk` table exists (FTS retrieval works); add embeddings when a provider is chosen → semantic recall.
- 🟢 **WhatsApp/telephony number→tenant map**: webhooks use a single-tenant fallback (`MESSAGING_DEFAULT_TENANT_ID`); add a firm-number→tenant table for true multi-tenant inbound.
- 🟢 **Court Data Gateway v2**: multi-provider routing/failover + the human-in-the-loop refresh UI (paste official-portal payload → parse to cache; `court_refresh_request` table ready).
- 🟢 **WhatsApp media download** + **telephony audio import** into storage (currently referenced by id/URL).
- 🟡 **AGENT_MODEL on prod**: agent synthesis runs on the keyless worker (haiku/sonnet via CLI); set `ANTHROPIC_API_KEY` for synchronous in-request answers.

---

## 1) Ready to build now — keyless 🟢

| Item | Phase | Scope | Notes |
|---|---|---|---|
| Analytics & reports | P10 | Postgres views/materialized views: receivables, client ledger, client aging, time & expense, per-employee, client+matter; a reports dashboard with filters | Needs time/billing data to be non-empty; views are keyless |
| Budget / spend | P10 | Per-matter budget + budget-vs-actual (time+expense+invoices) + threshold alerts (reuse reminder engine) | Builds on the shipped time/expense |
| Invoice assembly + GST | P6 | Assemble invoice from unbilled time+expense, editable lines, GST (place-of-supply, CGST/SGST vs IGST, HSN/SAC), FY-scoped sequential numbering, PDF, email via Resend | Keyless; only **collection** (Razorpay) is blocked |
| Invoice state machine + overdue reminders | P6 | draft→issued→partially_paid→paid (+overdue/void/written_off); overdue reminders via existing engine | After invoice assembly |
| Tasks per matter | P6 | Simple task list w/ due dates feeding the reminder engine | Small |
| Document versioning + approval | P7 | `document_version` (hash+ref) + approval workflow draft→in_review→approved→published→archived | Keyless |
| Granular document ACL | P7 | Per-recipient share (team/portal, view/download/sign) — extend the current `portal_shared` boolean | Keyless |
| Document templates + merge | P7 | `document_template` w/ merge tokens → assemble from client/matter | Keyless (AI-draft variant needs AI backend) |
| Dynamic custom-field forms | P5 | Render typed fields (text/number/date/checkbox/select) per practice area from `custom_field_def` (schema already shipped) | UI only |
| Practice-area management UI | P5 | CRUD for `practice_area` (table shipped) | Small |
| Auto-deadline extraction | P9 | When a new order/judgment syncs, propose deadline(s) → suggested in the calendar (one-click confirm) | Runs via the self-hosted worker (our Claude Code); keyless if worker stays up |
| In-app realtime notifications | cross | A notifications bell + Supabase Realtime feed (we persist `notification` rows already) | Keyless |
| Cloudflare R2 for document storage | infra | Swap the storage layer (the `storage_path` abstraction) to R2 (free egress) — you already have Cloudflare creds | Keyless; see §4 scale |
| OCR fallback for scanned PDFs | docs | tesseract.js path for image-only PDFs (currently flagged `needsOcr`) | Keyless |
| Mobile nav | UI | Sidebar is hidden < md with no drawer — add a mobile top-bar + menu | Polish |

---

## 2) Blocked on a key / external account 🔴

| Item | Phase | Blocked on | What I need from you |
|---|---|---|---|
| Razorpay payment links + webhook reconcile | P6 | Razorpay keys | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (test mode is fine) |
| Portal invoice payments | P8 | Razorpay (above) | same |
| Aadhaar eSign + eStamp | P7 | eSign provider account | Pick **Leegality** or **Digio**; `ESIGN_PROVIDER`, `ESIGN_API_KEY`, `ESIGN_API_SECRET`. (PoA/vakalatnama routed away from Aadhaar eSign by design) |
| Portal e-sign | P8 | eSign (above) | same |
| WhatsApp messaging (live) | E1/P10 | Meta-authorized BSP account | Gateway is built (mock works) — flip live with a BSP (AiSensy/Wati/Gupshup/Interakt/Twilio) + Meta business verification & approved templates: `WHATSAPP_BSP_API_KEY`, `WHATSAPP_BSP_PHONE_NUMBER_ID`, `WHATSAPP_BSP_BASE_URL`, `WHATSAPP_BSP_WEBHOOK_VERIFY_TOKEN` |
| Voice transcription (live) | E5 | Indic STT provider | Voice upload/tagging is built — flip transcription live with `STT_PROVIDER` (sarvam/ai4bharat/whisper) + `STT_API_KEY` |
| Cloud-telephony auto-recording | E5 | Telephony account | Auto-tag-by-number path: `TELEPHONY_PROVIDER` (exotel/knowlarity) + `TELEPHONY_API_KEY`/`_API_TOKEN`/`_SUBDOMAIN` |
| Lawyer Agent: precedents | E6 | Indian Kanoon API | `INDIANKANOON_API_KEY` → cite real case-law + cited-by validity (agent + KB work without it) |
| RAG semantic recall + pgvector | E6/P9 | Embeddings provider | `document_chunk` + FTS retrieval already live — add `EMBEDDINGS_PROVIDER`/`EMBEDDINGS_API_KEY` (Voyage/OpenAI; Anthropic has none) for semantic recall |
| Court multi-provider routing | E7 | Secondary court APIs | `VAKEEL360_API_KEY` / `KANOON_DEV_API_KEY` → failover beyond eCourtsIndia (cache + routing seam ready) |

---

## 3) Needs a decision from you 🟡

| Decision | Why it matters | Options |
|---|---|---|
| Prod AI backend | Case briefings / copilot need inference; Vercel has no `claude` binary | (a) set `ANTHROPIC_API_KEY` (synchronous, pennies/call) — recommended for prod; (b) keep the self-hosted Claude-Code worker (free, but needs an always-on box you run) |
| Worker hosting | The AI worker currently runs on **this build VM only** → stops if the VM is reclaimed | Move it to an always-on box (systemd/PM2) **or** switch to the API key and retire the worker |
| Go commercial / scale | Vercel **Hobby is non-commercial**; Supabase free = 1 GB storage / 5 GB egress | Vercel Pro ($20) + Supabase Pro ($25) + R2 for documents — see §4 |
| Real CNRs / advocate bar no. | Verify the remaining eCourts adapter endpoints | Share a real **advocate bar number** (for cause-list) so I can verify those mappings |

---

## 4) Infra / operational TODO

- **Scale path:** Vercel Pro + Supabase Pro + **Cloudflare R2** for document blobs (free egress; you have creds). DB stays Supabase.
- **eCourts adapter:** `getCaseByCNR` verified ✅. **`searchByAdvocate` + `getCauseList` field mappings are still unverified** against live responses (need a real bar number); bulk-refresh endpoint shape unverified → currently looping per-CNR.
- **Cron:** high-frequency jobs run via Supabase `pg_cron`→`pg_net` (beats Vercel Hobby daily limit). On Vercel Pro, move them back to native crons.
- **Worker supervision:** single instance; add a process supervisor + a duplicate-instance guard.
- **CI/tests:** CI runs lint+typecheck+build; add RLS policy tests + e2e to CI (we have `tests/*_smoke.ts`, `rls_isolation.ts`, `portal_isolation.ts` run manually).
- **Email confirmation** enforced app-side ✅ (anti-fake-signup).

---

## 5) Deferred — later phase 🔵

Native mobile apps · enterprise SSO/SCIM · dedicated analytics warehouse (BigQuery) — Phase-2 reporting runs on Postgres views · multi-region data residency.

---

## 6) Known polish / tech-debt

- Interactive "Generate AI summary" on prod = **queue-to-worker** (async) until an API key makes it synchronous.
- Party names stored ALL-CAPS from eCourts (title-cased only in the case title) — optionally title-case on display.
- eCourts "next hearing" can show a past date — that's the portal lagging the court (we show source + last-refreshed); the AI briefing flags it.
- `custom_field_def` / `practice_area` tables exist but have no management/render UI yet (see §1).
