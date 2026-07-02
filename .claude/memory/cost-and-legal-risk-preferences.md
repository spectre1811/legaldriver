---
name: cost-and-legal-risk-preferences
description: "Yash prefers keyless/on-box zero-marginal-cost over paid cloud APIs (even cheap ones), and human-gated automation for legal-risk actions"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 01576ca6-b548-4a76-8884-dbb260336242
---

Two durable preferences Yash steered during the drafting-agent + onboarding build (2026-06-29):

1. **Avoid per-page/per-call paid cloud APIs as the default, even when "cheap."** On OCR he pushed back ("google vision should be expensive, what else can we do to make this proper?") — the right answer was to make the **keyless on-box path genuinely good** (Tesseract.js + `sharp` preprocessing + `tessdata_best`; Surya as the self-hosted SOTA tier) and demote Google Vision to an optional convenience. Generalize: prefer zero-marginal-cost, on-box, data-stays-local solutions; treat paid managed APIs as opt-in fallbacks behind the provider seam. See [[phase3-architecture]].

2. **Gate legal-risk automation behind human confirmation.** For the deadline materializer he chose **propose-for-confirmation** over auto-create — a wrong limitation/procedure date can prejudice a client. Generalize: anything that could legally harm if wrong (deadlines, sending, filing) is computed/proposed by deterministic code but **the advocate confirms** before it becomes firm. Matches CLAUDE.md §5 (LLM infers; deterministic code verifies; never auto-send/file).

**Why:** he's building a legal product for advocates — correctness + trust + lean cost matter more than convenience.
**How to apply:** default to keyless/on-box behind a swappable seam; for any consequential or hard-to-reverse action, propose + confirm rather than auto-commit. He delegates heavily ("take the right and recommended options") but wants the safe option on legal-risk calls. [[yash-working-style]]
