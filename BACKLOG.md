# Legaldriver — Backlog Dashboard

_Last updated: 2026-06-25 (post Phase-3 hardening). The single source of truth for what's **not** done. Shipped work → `TASKBOARD.md` / git._

**Legend:** 🟢 ready (keyless) · 🟡 needs a decision · 🔴 blocked on a key/account · ⛔ blocked — no free/compliant path · 🔵 later phase

---

## ✅ Shipped (P1–P3)
P1 case tracking + calendar · P2 cause-list + notices + reminders · P3 Gmail ingest/classify ·
P5 matter depth · P6 time+expense · P7/P8 client portal (RLS-isolated) · P10 IPR.
**Phase 3 platform:** Court Data Gateway (shared cache + provider-health + stale-fallback + **Settings panel** + HITL refresh) · **client-first documents** (sender-match filing, per-client library, dedup, tag-to-case, doc-search **fixed** to tokenise filenames) · case console (search/filter/sort + **advocate/act filters** + saved views) · rich case detail + **similar-case** · **Lawyer Agent** (grounded + cited, BNS↔IPC KB, sonnet via keyless worker; **DeepSeek backend wired**) + Copilot UI · **local semantic embeddings** (bge-small on the worker, pgvector) · Messaging Gateway (mock) + **AI suggested replies** (never auto-sends) · Voice (manual upload) · **Communications timeline** (Gmail+WhatsApp unified, RLS-safe view) · **deletes** (cases, clients, IP, notices, advocates, calendar events) · **practice areas seeded** · enhanced **calendar** (agenda + filters + stats).

---

## 🟢 Ready to build now — keyless (priority order)

| Item | Why / scope |
|---|---|
| **Own court-data "reference spine"** | The "build our own data" path (see `docs/decisions/2026-06-25-court-data-sourcing.md`). Ingest, all free + compliant: **India Code** bare acts (deadline-rules engine), **e-SCR** Supreme Court judgments (public S3 mirror, CC-BY), **NJDG / data.gov.in** court+judge lists, **DevDataLab** 81M historical district records (ODbL). This is the biggest strategic win and needs **no key**. |
| HITL court-refresh: parse pasted payload | The Settings HITL form stores the pasted official-portal payload; add the deterministic parser → write into `court_cache` + `matter`. Closes the compliant live-data loop. |
| Analytics & reports | Postgres views: receivables, client/matter ledger, aging, time/expense, per-employee + a reports page. |
| Invoice assembly + GST | Assemble from unbilled time/expense, GST (CGST/SGST vs IGST, HSN/SAC), FY numbering, PDF, email. (Razorpay collection is 🔴.) |
| Document versioning + approval + templates | `document_version` + draft→approved workflow; merge-token templates. |
| Outbound email logging → Communications | Log Resend sends (notices/reminders) so the comms timeline shows two-way email. |
| Suggested-reply → composer prefill | One-click load the AI draft into the WhatsApp composer (today: copy-to-clipboard). |
| OCR fallback for scanned PDFs | tesseract path for image-only PDFs (currently flagged `needsOcr`). |
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
- **Fully-automated free live case-status + cause-list refresh.** The official eCourts portals gate every query behind a CAPTCHA and forbid automated access; NJDG's Open API is restricted to government/institutional users, not a private SaaS. Every commercial provider obtains this via CAPTCHA-handling fetch — **our hard line forbids that**. *Compliant paths we DO have:* (1) **HITL refresh** (you solve the CAPTCHA, we parse the result), (2) a **licensed API as opt-in fallback** (eCourtsIndia/Vakeel360). Revisit if NJDG opens to non-institutional access. Full analysis: `docs/decisions/2026-06-25-court-data-sourcing.md`.

---

## 🟡 Decisions for you
- **Prod AI backend:** keep the keyless self-hosted worker (free, needs the box up) ↔ DeepSeek (fund it, synchronous) ↔ Anthropic key. Worker runs today.
- **Go commercial / scale:** Vercel Pro ($20) + Supabase Pro ($25) + Cloudflare R2 for document blobs (you have CF creds).
- **Worker hosting:** currently on this build VM; move to an always-on box (systemd) or switch to DeepSeek/API to retire it.
- A real **advocate bar number** to verify the `searchByAdvocate`/`getCauseList` eCourts mappings.

---

## 🧹 Tech debt / polish
- Two confirm-delete components (`confirm-delete.tsx` + `delete-button.tsx`) — unify.
- Self-hosted embeddings deps (`@xenova/transformers`) carry npm-audit advisories (worker-only, not in the request path) — review.
- CI runs lint+typecheck+build only; add the `tests/*` suite (gateway, agent, filing, embed, RLS, portal) to CI.
- Party names stored ALL-CAPS from eCourts (cosmetic).
- WhatsApp/telephony webhooks use a single-tenant fallback (`MESSAGING_DEFAULT_TENANT_ID`) — add a firm-number→tenant map for true multi-tenant inbound.

## 🔵 Later phase
Native mobile capture app (voice/E5) · enterprise SSO/SCIM · BigQuery analytics warehouse · multi-region residency · faceted search service (Typesense/Meilisearch) when FTS stops scaling.
