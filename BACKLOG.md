# Legaldriver — Backlog Dashboard

_Last updated: 2026-06-25 (post Phase-3 hardening). The single source of truth for what's **not** done. Shipped work → `TASKBOARD.md` / git._

**Legend:** 🟢 ready (keyless) · 🟡 needs a decision · 🔴 blocked on a key/account · ⛔ blocked — no free/compliant path · 🔵 later phase

---

## ✅ Shipped — latest
**Structured documents:** category taxonomy + controlled doc_type vocabulary; Documents & per-client library grouped by category + category filter; **document detail page** (metadata, filed-under, summary, extracted-text, download, actions). **eCourts-app/Kleopatra investigated → NON-COMPLIANT** (same CAPTCHA-gated NJDG data; no public API) — HITL + licensed-fallback remain the only compliant paths.

## ✅ Shipped (P1–P3)
P1 case tracking + calendar · P2 cause-list + notices + reminders · P3 Gmail ingest/classify ·
P5 matter depth · P6 time+expense · P7/P8 client portal (RLS-isolated) · P10 IPR.
**Phase 3 platform:** Court Data Gateway (shared cache + provider-health + stale-fallback + **Settings panel** + HITL refresh) · **client-first documents** (sender-match filing, per-client library, dedup, tag-to-case, doc-search **fixed** to tokenise filenames) · case console (search/filter/sort + **advocate/act filters** + saved views) · rich case detail + **similar-case** · **Lawyer Agent** (grounded + cited, BNS↔IPC KB, sonnet via keyless worker; **DeepSeek backend wired**) + Copilot UI · **local semantic embeddings** (bge-small on the worker, pgvector) · Messaging Gateway (mock) + **AI suggested replies** (never auto-sends) · Voice (manual upload) · **Communications timeline** (Gmail+WhatsApp unified, RLS-safe view) · **deletes** (cases, clients, IP, notices, advocates, calendar events) · **practice areas seeded** · enhanced **calendar** (agenda + filters + stats).

---

## 🟢 Ready to build now — keyless (priority order)

| Item | Why / scope |
|---|---|
| ~~Knowledge spine (statutes/limitation/deadline rules)~~ ✅ **DONE** | Seeded `deadline_rule` (70 rows, NI-138/CPC/Limitation/Arbitration/Consumer/BNSS) + expanded `legal_reference` to 38; case page applies jurisdiction-aware deadlines → calendar. Powers the deadline engine + grounds the agent. |
| **External full-text corpora** (deferred from spine) | Still keyless but needs more work: **India Code** bare-act text (no REST API → HTML parser needed), **DevDataLab** 81M historical district records (large ODbL bulk download + import), **NJDG/data.gov.in** court+judge lists (dataset-specific). **e-SCR is unreachable from our host (000)** — revisit host/proxy. See `docs/decisions/2026-06-25-court-data-sourcing.md`. |
| ~~HITL capture + cause-list ingester~~ ✅ **DONE** | **HITL bookmarklet** (Settings): you solve the CAPTCHA on eCourts, click → `/api/court/capture` parses the page → `court_cache` + matter (e2e-verified on prod). **Cause-list upload** (`/dashboard/cause-list`): upload the court PDF → match CNRs → update next-hearing dates. Both compliant, keyless. Next: auto-fetch published cause-list PDFs from known court URLs (per-court catalog). |
| ~~Analytics dashboard~~ ✅ **DONE** | `/dashboard/analytics` (analytics_summary RPC): caseload, time+billing, clients/docs, and a "Your data — ingested & stored" panel. Per-employee/client ledger + aging still to add. |
| Invoice assembly + GST | Assemble from unbilled time/expense, GST (CGST/SGST vs IGST, HSN/SAC), FY numbering, PDF, email. (Razorpay collection is 🔴.) |
| **AI document auto-tagging — raise hit-rate** | (1) give the classifier each case's **party_names** (not just title) so docs match on parties without a CNR; (2) **sender → sole-open-case** heuristic (known client w/ exactly one active case → tag by default); (3) surface the AI's **suggested case** on needs-review docs with a one-click "Tag to [case]". |
| ~~Court-data corpus + Case Research + agent precedent~~ ✅ **DONE / loading** | Own datastore from AWS Open Data "Indian High Court Judgments" (CC-BY, no CAPTCHA). `corpus_judgment` + `scripts/ingest-ihcj.ts` (generalized to **all 25 High Courts**, `--courts=all`). **541k+ judgments / 8 courts** loaded (Gujarat full 2010–25 = 327k; +Patna/Calcutta/Gauhati/…; big courts loading). **/dashboard/research** search (party/case/judge + court/year filters → CC-BY PDF). **Lawyer Agent grounded in real precedent** (verified). **Next:** (a) finish all-courts/all-years load (faster bulk path wants the Supabase DB password for direct COPY); (b) **Supreme Court via e-SCR** + **district courts via DevDataLab** (other court tiers — not in the HC bucket); (c) ingest **judgment PDF text** for topical/semantic search; (d) NJDG stats. **NOT** via eCourts CAPTCHA — ⛔. |
| Document versioning + approval + templates | `document_version` + draft→approved workflow; merge-token templates. |
| Outbound email logging → Communications | Log Resend sends (notices/reminders) so the comms timeline shows two-way email. |
| Suggested-reply → composer prefill | One-click load the AI draft into the WhatsApp composer (today: copy-to-clipboard). |
| **Drafting agent** (`docs/decisions/2026-06-29-drafting-agent.md`) | **P-A OCR ✅** · **P-B KB ✅** · **P-C service ✅** · **P-D console ✅**. Service (`src/lib/services/draft/*` + `src/lib/docs/draft/sections.ts`): deterministic-first section-ID (override → cited-in-source → template defaults) → grounded retrieve (KB old↔new + deadlines + matter) → provider-agnostic `completeJson` into **body + assumptions/presumptions/clarifications/bullets/citations**; `draft`/`draft_version` tables (RLS, applied to prod); sync **or** worker `draftPending()` tick. Console `/dashboard/draft` (upload→draft, two-pane source/draft, sections editor, regenerate, edit, finalize→document, version history) + **“Draft a reply”** on every document. **Verified e2e on live DB** (S.138 reply: 9.7k-char draft, 13 clarifications, 4 cites, gap-aware `[TO CONFIRM]`). **Next → P-E**: open-corpus precedent in drafts · bilingual (hi/gu) output · per-section regenerate · Vision/Surya hard-scan tier. |
| ~~OCR fallback for scanned PDFs~~ ✅ **DONE + made proper (P-A)** | `src/lib/docs/ocr/*` provider seam (env-routed, like the LLM layer), **zero per-page cloud cost by default**: **keyless on-box Tesseract.js** made *proper* via **(1) `sharp` preprocessing** (grayscale→upscale→normalise→denoise→sharpen — biggest free accuracy win) + **(2) `tessdata_best` LSTM models** (Indic matras/half-forms; `TESSERACT_DATA=best`). **Surya** SOTA self-hosted quality tier behind the seam (`SURYA_OCR_CMD`, no per-page cost, on-box). **Google Vision demoted to optional** convenience (`GOOGLE_VISION_API_KEY`). `auto` prefers the best on-box engine, escalates on low confidence. Worker `ocrPending()` tick fills `parsed_text` + provenance + `langs`, clears `needsOcr`. **Verified**: degraded scan conf 0.95; real prod scan en+gu+hi conf 0.94. **Free Indic next:** Bhashini/ULCA provider. |
| Budget/spend per matter | Budget vs actual + threshold alerts (reuse reminder engine). |
| Mobile nav | Sidebar hidden < md; add a drawer. |
| Dynamic custom-field forms | Render typed fields per practice area (`custom_field_def` schema exists). |

---

## 🔴 Blocked on a key / account (built behind the seam — flip on when provided)

| Item | Exact source | What to provide |
|---|---|---|
| **WhatsApp messaging (live)** | Meta Cloud API direct (free tier) — *you're getting this* | `WHATSAPP_BSP_API_KEY` (System-User token), `WHATSAPP_BSP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_BSP_WEBHOOK_VERIFY_TOKEN` + webhook config |
| **DeepSeek reasoning LLM** | platform.deepseek.com → Billing | **Add credits** (key + `deepseek-v4-pro` validated; "Insufficient Balance" is the only blocker). Then `AGENT_BACKEND=deepseek`. |
| Voice transcription | Bhashini (free, govt) / self-hosted Whisper (free) / Sarvam | `STT_PROVIDER` + `STT_API_KEY` — or I self-host Whisper on the worker (keyless) |
| Auto call-recording | Exotel / Knowlarity (paid; no free tier in India) | `TELEPHONY_*` |
| Agent precedents | indiankanoon.org/api (₹500 free on signup) | `INDIANKANOON_API_KEY` |
| Payments | Razorpay (test mode free) | `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET` |
| eSign | Leegality / Digio | `ESIGN_PROVIDER/API_KEY/API_SECRET` |
| Court multi-provider failover | Vakeel360 / kanoon.dev | `VAKEEL360_API_KEY` / `KANOON_DEV_API_KEY` |

---

## ⛔ Blocked — no free/compliant path today
- **Fully-automated (no-human) free live case-status refresh.** eCourts gates every query behind a CAPTCHA and forbids automated access; NJDG's Open API is restricted to government/institutional users. We will NOT use CAPTCHA-solving / Bright-Data-style bypass (ToS + IT Act + reputational risk for a legal product). **Mitigated** — we now have two compliant fresh-data paths live: **HITL capture** (human solves CAPTCHA → we parse) and **cause-list upload**; plus a **licensed API as opt-in cached fallback**. The only thing still blocked is *unattended* automation. Revisit if NJDG opens or we get authorized access. Analysis: `docs/decisions/2026-06-25-court-data-sourcing.md`.

---

## ✅ RESOLVED — court corpus on S3 + Athena (~18.6M judgments, HC + SC)
S3 + Athena lake (your AWS, ap-south-1): **18,554,467 High Court (all 25 HCs) + 43,495 Supreme Court (e-SCR) judgments**, unified in the `judgments_all` view; ~free queries (partition projection); scoped read-only key; Supabase untouched. **Case Research + Lawyer-Agent precedent span every Indian High Court + the Supreme Court.** ✅ e-SCR done.
**Next coverage (`docs/decisions/2026-06-29-rich-court-data-sources.md`):**
- ✅ **`parquet_case_details` — DONE** (advocates, acts/sections) for the 3 covered HCs; mirrored to the lake + Athena `case_details`; surfaced in the judgment reader (`caseDetailByCnr`). Grows automatically as the open set expands. (Hearing-history struct deferred — complex nested type, low ROI until more courts.)
- ✅ **On-demand judgment TEXT — DONE.** Reader page (`/dashboard/research/judgment`) extracts + S3-caches PDF text; the **Lawyer Agent pulls the top precedent's real text into its grounding** (verified). Remaining: **embed** opened judgments for semantic (vector) precedent — bounded/on-demand (vector-store TBD; not Supabase free).
- 🟡 **DevDataLab** district-court history (81M cases, 2010–2018) — a large multi-GB bulk ETL, and **ODbL share-alike**: querying it internally is fine, but exposing a derived DB to users triggers share-alike obligations. Needs a deliberate go/no-go (and is historical, not live), so not a blind grind.
- 🔴 **Indian Kanoon API** full text + citations (₹500 prepaid — needs your top-up; biggest agent-quality jump).
- 🟡 **NJDG authorized access** (email eCommittee/DoJ/Gujarat HC CPC — I can draft it).
- ⛔ Live eCourts case-status/cause-list (CAPTCHA) → HITL/cause-list/licensed.

- **Prod AI backend:** keep the keyless self-hosted worker (free, needs the box up) ↔ DeepSeek (fund it, synchronous) ↔ Anthropic key. Worker runs today.
- **Go commercial / scale:** Vercel Pro ($20) + Supabase Pro ($25) + Cloudflare R2 for document blobs (you have CF creds).
- **Worker hosting:** currently on this build VM; move to an always-on box (systemd) or switch to DeepSeek/API to retire it.
- A real **advocate bar number** to verify the `searchByAdvocate`/`getCauseList` eCourts mappings.

---

## 🛠 Dev tooling (evaluated)
- **code-review-graph** (tirth8205) — ✅ endorsed for **dev/CI** token savings (~82× on code-review/navigation; Tree-sitter+SQLite, MCP-exposed). NOT a product-runtime component. **Blocked on this box** (PEP 668: no pip/ensurepip/venv) → wire in **CI** (GitHub Actions, clean Python) + an `.mcp.json` entry; verify the exact CLI/package name first. Low risk (local, read-only).
- **ruflo** (ruvnet) — 🟡 pass for now. Heavy multi-agent meta-harness; big dependency + lock-in, token savings unquantified; conflicts with our lean/agnostic design. We already have Workflow + subagents + the agnostic `completeJson`/`completeText` router. Cherry-pick ideas at most.

## 🧹 Tech debt / polish
- Two confirm-delete components (`confirm-delete.tsx` + `delete-button.tsx`) — unify.
- Self-hosted embeddings deps (`@xenova/transformers`) carry npm-audit advisories (worker-only, not in the request path) — review.
- CI runs lint+typecheck+build only; add the `tests/*` suite (gateway, agent, filing, embed, RLS, portal) to CI.
- Party names stored ALL-CAPS from eCourts (cosmetic).
- WhatsApp/telephony webhooks use a single-tenant fallback (`MESSAGING_DEFAULT_TENANT_ID`) — add a firm-number→tenant map for true multi-tenant inbound.

## 🔵 Later phase
Native mobile capture app (voice/E5) · enterprise SSO/SCIM · BigQuery analytics warehouse · multi-region residency · faceted search service (Typesense/Meilisearch) when FTS stops scaling.
