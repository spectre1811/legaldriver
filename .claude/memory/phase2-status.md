---
name: phase2-status
description: "Legaldriver Phase 2 build status, what's done, and what's blocked on keys"
metadata: 
  node_type: memory
  type: project
  originSessionId: 01576ca6-b548-4a76-8884-dbb260336242
---

Legaldriver = full rename of LexDriver (2026-06-25). Phase 1 (P0–P4) shipped + redesigned
(new design system: Inter+Fraunces, warm-paper/indigo/brass, shared ui primitives, Gujarati
કાનૂની on auth). Live at legaldriver.vercel.app.

**Phase 2 brief** (legal-mvp-build-brief-phase2.md): P5 matter-depth · P6 time/billing ·
P7 docs/eSign · P8 client portal · P9 AI copilot (RAG) · P10 WhatsApp + IPR + analytics.

**Done so far:** P5 FOUNDATION — migration 0005 (practice_area, custom_field_def,
activity_event, adverse_party, matter.practice_area_id, all RLS); Clients page + intake with
fuzzy conflict-of-interest check (src/lib/conflict.ts); activity timeline on case page
(src/lib/activity.ts logActivity, wired into case add/upload). Also added (P1.5): manual
calendar entries (calendar_event, migration 0004) + deadlines on calendar; case hub redesign
with AI briefing (matter.ai_summary, migration 0003), in-case document upload, manual edit.

**Keyless modules I can build next without the user:** P8 portal core (Supabase auth +
strict portal_client RLS, scoped views, messaging — minus payments), analytics (Postgres
views), IPR module, budget/spend, P5 dynamic custom-field forms, conflict adverse-party capture.

**Blocked on the user (keys/decisions):**
- AI backend for prod (P9 + case summaries): paid ANTHROPIC_API_KEY OR self-hosted worker/
  bridge using our Claude Code ([[classifier-local-claude-cli]]). Prod currently CLASSIFIER_BACKEND=off.
- Embeddings for RAG (P9): Anthropic has NO embeddings API → need Voyage AI or OpenAI key, or
  an OSS embedding model run on the self-hosted worker. Real decision/blocker.
- Razorpay test keys (P6 billing). eSign provider account — Leegality/Digio (P7). WhatsApp BSP
  account + approved utility templates (P10) — needs Meta business verification (user-side).
- A real CNR to verify the eCourtsIndia adapter field-mapping (case pages empty for synthetic CNRs).
- Scale: Vercel Hobby is non-commercial → Vercel Pro + Supabase Pro + Cloudflare R2 for docs
  ([[deployment-vercel]]).
