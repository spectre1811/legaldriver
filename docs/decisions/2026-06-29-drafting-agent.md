# Decision — Drafting Console / Drafting Agent

Date: 2026-06-29
Status: Proposed (decision doc — design only, no code)
Owner: Yash
Related: `2026-06-25-phase3-architecture.md`, `2026-06-29-vector-store.md`, `0015_reference_spine.sql`

---

## 0. Problem & intent

The operator wants a **drafting console** inside Legaldriver. Take a document that is already
in the system (or upload/add one → save to Storage), read it **properly** — even if it is a
**scanned image in any Indian language** or a digital PDF — figure out **what kind of reply/
draft it calls for**, identify the **relevant sections/subsections** under Indian law, and
**produce a draft** of the right category. The draft must state its **assumptions, presumptions,
clarifications needed, and key points as bullets**. It runs **automatically** (auto-detects the
category + sections), unless the user overrides which section/subsection to draft under.

It is itself a **drafting agent** — same shape as our existing Lawyer Agent
(`src/lib/services/agent/*`): retrieve grounded context → prompt an LLM → cite-or-abstain →
assistive output the advocate edits before use. The genuinely new capability is **OCR for
scanned Indic documents**; everything else extends seams we already have.

Non-goals: auto-sending/filing the draft; replacing the advocate's judgment; "legal advice".
The agent **drafts a starting point, cited, with gaps flagged** — a human finalises.

---

## 1. What exists vs. what is new

| Capability | Status | Where |
|---|---|---|
| Digital-PDF / text extraction | **Exists** | `src/lib/docs/extract.ts` (unpdf; already flags `needsOcr` for image-only scans) |
| Doc category taxonomy + bucketing | **Exists** | `src/lib/docs/categories.ts` (`CATEGORIES`, `DOC_TYPES`, `categoryOf`) |
| Provider-agnostic LLM (prose + JSON) | **Exists** | `src/lib/ai/complete.ts` — `completeText`, `completeJson`, multi-backend router |
| Grounded retrieval + cite-or-abstain | **Exists** | `src/lib/services/agent/{retrieve,prompt,agent}.ts` |
| Legal KB (old↔new law, procedure, limitation) | **Exists** | `legal_reference`, `deadline_rule` seeds (`0015_reference_spine.sql`) |
| Documents storage + table | **Exists** | Supabase `documents` bucket + `document` table (`0001_init.sql`, `+category` in `0018`) |
| Self-hosted background worker | **Exists** | `scripts/classify-worker.ts` (keyless Claude CLI, RLS-bypass admin, tenant-scoped) |
| Semantic chunks / pgvector | **Exists** | `document_chunk`, `match_document_chunks`, `embed.ts` |
| Open-judgment precedent corpus | **Exists** | `corpus-athena`, `judgment-text` (used by `retrieve.ts`) |
| **OCR for scanned / Indic-language docs** | **NEW** | `src/lib/docs/ocr/*` (provider seam) — §2 |
| **Language detection** | **NEW** | cheap deterministic script detector + OCR-returned hint — §1 |
| **Drafting-convention KB ("baked skill")** | **NEW** | `draft_template` seed table — §3 |
| **Section/subsection identifier** | **NEW** | deterministic category→statute map + KB lookup, LLM only for ambiguity — §1 |
| **Drafting agent + console** | **NEW** | `src/lib/services/draft/*`, `draft` + `draft_version` tables, `/dashboard/draft` — §1,§4 |

Bottom line: ~70% is reuse. The new surface is **OCR**, the **drafting KB**, the **draft data
model + console**, and the **drafting agent service** that wires retrieval → `completeText`.

---

## 2. Pipeline

Stages tagged **[D]** deterministic code or **[L]** LLM. LLM **infers**; deterministic code
**verifies, files, and gates** (project convention #5). Each stage degrades gracefully — a
failed/low-confidence stage drops to a `needs_review` / clarification state, never a guess.

```
(a) Ingest / select          [D]  pick an existing `document` row, OR upload → Storage `documents` bucket → `document` row (source='upload')
(b) Fetch bytes              [D]  admin/RLS Storage download → Buffer + mime
(c) Digital-vs-scanned       [D]  extractText() (unpdf). text ≥ threshold → digital; else needsOcr=true
(d) OCR (only if scanned)    [D]  ocr/index.ts (provider behind interface, §2). returns {text, langs[], confidence}
(e) Language detect          [D]  Unicode-block script detector over the extracted text (+ OCR lang hint). tags hi/gu/en/mixed
(f) Persist extracted text   [D]  write document.parsed_text + extracted.ocr={provider,langs,confidence}; (re)chunk for embeddings
(g) Classify category        [L→D] reuse classify-core to get doc_type; categoryOf() → canonical category [D verifies into taxonomy]
(h) Identify sections        [D first] category→statute map + legal_reference lookup; [L] only to disambiguate / extract cited sections from the doc
(i) Pick draft template      [D]  draft_template KB row for (responds_to_category) — the "baked skill" (§3); user override wins
(j) Retrieve grounding       [D]  draft/retrieve.ts: source-doc text + legal_reference (resolved sections, old↔new) + deadline_rule + optional precedent
(k) Draft                    [L]  completeText() with the template's structure + grounded context → prose with assumptions/presumptions/clarifications/bullets
(l) Post-process & gate      [D]  attach citations, "not legal advice" footer, status=draft (never sent), persist draft_version
(m) Review & edit            [D]  console: advocate edits, regenerates a section, or sets sections manually then re-runs
```

### Stage notes

- **(c) digital-vs-scanned** is already implemented: `extract.ts` returns `needsOcr:true` when a
  PDF yields <20 chars. We branch on that flag — no new detection logic for PDFs. For images
  (`image/*` uploads) we go straight to OCR.
- **(e) language detect** is deterministic and keyless: count characters per Unicode block
  (Devanagari U+0900–097F → hi/mr, Gujarati U+0A80–0AFF → gu, Latin → en) and take the
  dominant block(s); cross-check against the OCR provider's returned language hint. Drives the
  template language and a "draft in English / vernacular" toggle.
- **(g) classify** reuses `buildClassifyPrompt`/`CLASSIFY_SCHEMA`/`normalizeClassification`
  (`src/lib/docs/classify-core.ts`) — the same path the worker already runs. `categoryOf()`
  forces the LLM's free-text `doc_type` back into the controlled taxonomy **[D]**.
- **(h) section identification is deterministic-first.** A static map (in code, version-controlled
  like `categories.ts`) says e.g. *legal_notice about a returned cheque → NI Act s.138 / s.139;
  reply to s.138 notice → s.139 rebuttal + facts-in-issue; summons under CrPC/BNSS → BNSS reply
  framework*. We then pull the matching `legal_reference` rows (gives old↔new mapping +
  summary). The **LLM is invoked only** to (i) extract section numbers *cited inside the source
  document* and (ii) disambiguate when the deterministic map returns multiple candidates — never
  to invent a section. Anything unresolved becomes a **clarification** in the output, not a guess.
  If the user specified sections, we **skip the LLM step** and use theirs (deterministic).
- **(k) draft** uses `completeText` (provider-agnostic; CLI on the worker, API/DeepSeek/custom
  elsewhere). The prompt = drafting-agent system rules + template skeleton + grounded context.
  Output is required to separate **Assumptions / Presumptions / Clarifications needed / Draft
  (with bulleted operative points)** so gaps are explicit, mirroring how the Lawyer Agent must
  abstain rather than fabricate.

### Where it runs

Mirror the agent's two-path execution (`agent.ts`):
- **Synchronous** when a backend is reachable in-request (API key, or DeepSeek/custom over HTTP):
  draft returns immediately in the console.
- **Queued** otherwise (keyless Vercel prod): write a `pending` `draft_version` with the resolved
  template + grounded context in `meta`, and the **self-hosted worker** (`classify-worker.ts`,
  new `draftPending()` tick) synthesizes with the local Claude CLI and writes the result back —
  exactly the pattern `answerPending()` already uses.
- **OCR runs on the worker box** (Tesseract is keyless/offline there). The hosted app, on upload,
  enqueues an OCR job; the worker fills `parsed_text`. (If a cloud OCR key is configured, the
  hosted app can OCR inline — same seam, §2.)

---

## 3. OCR — recommendation + pluggable seam

### Why this is the hard part

The document may be a **scanned image** in **any Indian language**. `extract.ts` only handles
*digital* text (unpdf) and explicitly flags scans as out of scope today. We need real OCR that
covers **Devanagari (Hindi/Marathi), Gujarati, and other Indic scripts**, cheaply, ideally
keyless, and compliant (no PII leaving our trust boundary where avoidable).

### Options compared

| Option | Indic coverage | Scanned accuracy | Cost | Ease / ops | Compliance |
|---|---|---|---|---|---|
| **Tesseract 5 + Indic `traineddata`** (self-host on worker) | Hindi, Gujarati, Tamil, Telugu, Kannada, Malayalam, Punjabi, Bengali, Odia etc. via `tessdata`/Indic-OCR models | Good on clean ≥300 DPI print; **weak** on low-res, skew, handwriting; Indic matra/half-forms need decent scans | **Free / keyless** | Native binary + lang packs on the worker box; we already run a worker | **Best** — bytes never leave our box |
| **Google Cloud Vision — `DOCUMENT_TEXT_DETECTION`** | **Officially supports Hindi, Gujarati, Marathi, Tamil, Telugu, Kannada, Malayalam, Punjabi** (+ experimental Bengali/Assamese/Oriya); **auto-detects** language in document mode | **Strong** on real-world scans, skew, mixed script | ~$1.50 / 1,000 pages (first 1k/mo free) | Needs a GCP key; simple REST | Bytes go to Google; fine for *public* court docs, gate for PII |
| **Google Document AI (OCR processor)** | Same Indic engine as Vision, richer layout/blocks | Strong + layout | ~$0.65–1.50 / 1,000 pages basic OCR; +$36/mo per deployed processor for some | Key + processor setup | Same as Vision |
| **AWS Textract** (we have AWS) | **No Indic support** — English/Spanish/German/Italian/French/Portuguese only | n/a for our case | n/a | n/a | n/a |
| transformers.js / docTR / **PaddleOCR (PP-OCRv5)** / **Surya** | Paddle: Devanagari + many; Surya: 90+ incl. Devanagari (~87% pass); Indic-docTR/IndicPhotoOCR cover Gujarati | Modern DL, strong; heavier deps (Python/Paddle or large JS/wasm models) | Free / keyless | Heaviest to operate (Python runtime or big model downloads) | Best (local) |

Key facts: **AWS Textract does not support any Indic language** (English/Spanish/German/Italian/
French/Portuguese only) → ruled out despite "we have AWS". **Google Vision/Document AI officially
support Hindi + Gujarati and auto-detect in document mode** → the strong cloud fallback.
**Tesseract** is the cheapest keyless path and is good *enough* for the clean court/notice scans
that dominate the corpus, at 300 DPI.

### Recommendation

> **Default: self-hosted Tesseract 5 with Indic `traineddata`, on the worker box (keyless,
> free, private).** **Fallback / quality tier: Google Cloud Vision `DOCUMENT_TEXT_DETECTION`**
> when a key is configured and either (a) Tesseract confidence is low, or (b) the user clicks
> "improve OCR". This is the cheapest combination that actually handles scanned Indic documents,
> keeps PII on our box by default, and gives a one-flag upgrade for hard scans.

Defer Paddle/Surya/docTR to a future tier — strictly better DL accuracy but materially heavier
ops (Python/large models) for marginal gain over Tesseract+Vision today. They drop into the same
seam if ever needed.

### The seam (mirror `complete.ts`)

A provider interface, env-routed, identical philosophy to our LLM layer (convention #7):

```
// src/lib/docs/ocr/types.ts
interface OcrProvider {
  name: string;
  ocr(buf: Buffer, mime: string, opts?: { langs?: string[] }):
    Promise<{ text: string; langs: string[]; confidence: number } | null>;
}
// src/lib/docs/ocr/index.ts   → ocr(buf, mime, opts): picks provider by env, falls back
//   providers: tesseract.ts (default, keyless) · google-vision.ts (key) · (paddle/surya later)
//   env: OCR_PROVIDER=tesseract|google|auto  · OCR_FALLBACK=google  · OCR_MIN_CONFIDENCE=0.6
//        GOOGLE_VISION_API_KEY=...  · TESSERACT_LANGS=eng+hin+guj
```

`extract.ts` stays the front door: when it returns `needsOcr`, the caller (worker/console action)
invokes `ocr()`. For `image/*` uploads, route straight to `ocr()`. Image-only **PDFs** are
rasterised page→PNG (pdfium/`pdf-to-img`) before Tesseract; Vision accepts PDF directly.
`auto` = try Tesseract, and if `confidence < OCR_MIN_CONFIDENCE` and a Vision key exists, retry
with Vision and keep the higher-confidence result. Always persist `extracted.ocr = {provider,
langs, confidence}` for provenance (convention #3).

---

## 4. Drafting knowledge — "bake a skill" as data

Drafting conventions are **maintained data**, not prompt prose — same model as `legal_reference`
/ `deadline_rule`: tenant-scoped seed, RLS, seeded for existing + new tenants, editable, cited.
This is how we "bake a skill": the LLM gets a **structured skeleton + required points + section
hooks**, so output is consistent and reviewable rather than improvised each time.

```sql
create table draft_template (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenant(id) on delete cascade,
  responds_to_category text not null,   -- categoryOf() key the SOURCE doc falls under (e.g. 'notices')
  responds_to_doc_type text,            -- finer trigger (e.g. 'legal_notice','summons') — nullable
  produces_doc_type    text not null,   -- the DRAFT's doc_type (e.g. 'reply_notice','written_statement')
  title               text not null,    -- "Reply to a S.138 NI Act demand notice"
  jurisdiction        text,             -- "NI Act s.138/139", "BNSS", "CPC Order VIII"
  default_sections    text[] default '{}', -- statutory hooks to draft under (overridable by user)
  structure           jsonb not null,   -- ordered sections: [{heading, guidance, required_points[]}]
  conventions         text,             -- Indian drafting norms: cause-title, verification, prayer, court format
  language            text default 'en',-- 'en' | 'hi' | 'gu' | 'bilingual'
  source              text,             -- provenance for the convention (act / practice note)
  is_default          boolean default true,
  created_at          timestamptz default now()
);
```

Seed pack (initial, derived from existing taxonomy + KB), e.g.:
- **Reply to legal/demand notice** (notices → `reply_notice`): cause-title, para-wise reply,
  denials, factual narrative, without-prejudice, NI Act s.139 presumption rebuttal, prayer.
- **Written statement** (summons/plaint → `written_statement`): CPC Order VIII — para-wise
  admissions/denials, preliminary objections, additional pleas, verification.
- **Reply / counter-affidavit to petition** (pleadings → `affidavit`/`reply`).
- **Bail / anticipatory-bail application** (summons/FIR → `application`): BNSS s.482/480 hooks
  (mapped from CrPC via `legal_reference`), grounds, undertakings.
- **Reply to a court order / compliance** (orders_judgments → `application`).
- **Vakalatnama / authority** (boilerplate, mostly deterministic fill).

`structure.required_points` is what becomes the **bullet-point checklist** in the draft; any
point the source doc doesn't supply becomes a **"clarification needed"** line — closing the loop
on the operator's "state assumptions, presumptions, clarifications" requirement. Templates resolve
their `default_sections` against `legal_reference` so old↔new (IPC↔BNS, CrPC↔BNSS, IEA↔BSA)
mappings flow into the draft automatically.

---

## 5. Data model, storage & UI

### Tables (each gets the standard 4 RLS policies keyed to `current_tenant_id()` — convention #1)

```sql
create table draft (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenant(id) on delete cascade,
  source_document_id uuid references document(id) on delete set null,  -- the doc being responded to
  matter_id       uuid references matter(id) on delete set null,
  client_id       uuid references client(id) on delete set null,
  template_id     uuid references draft_template(id) on delete set null,
  produces_doc_type text,
  sections        text[] default '{}',   -- statutory sections actually drafted under (auto or user-set)
  language        text default 'en',
  title           text,
  status          text not null default 'draft'
                  check (status in ('pending','draft','edited','finalized','discarded')),
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create table draft_version (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  draft_id    uuid not null references draft(id) on delete cascade,
  version     int not null,
  body        text,                       -- the prose (markdown)
  assumptions   text[] default '{}',
  presumptions  text[] default '{}',
  clarifications text[] default '{}',     -- open questions the advocate must answer
  bullet_points text[] default '{}',      -- operative points / checklist
  citations   jsonb default '[]',         -- {n, source, ref, title, url} — same shape as agent_turn.citations
  generated_by text,                      -- 'llm' | 'human-edit'
  meta        jsonb default '{}',         -- pending: {question/template/context} for the worker
  created_at  timestamptz default now(),
  unique (draft_id, version)
);
```

- **Source-doc link**: `draft.source_document_id` (+ `matter_id`/`client_id` inherited from it).
- **Versions**: every regenerate/edit appends a `draft_version`; the console shows history and a
  diff. The advocate's manual edits land as `generated_by='human-edit'` versions.
- **Finalised draft → real document**: "Save as document" writes the finalised body to the
  `documents` bucket and creates a `document` row (`source='upload'`, `doc_type=produces_doc_type`,
  linked back via `extracted.draft_id`) — so a produced draft re-enters the normal doc lifecycle.
- **Storage**: source files already live in the `documents` bucket; drafts are text in Postgres
  until finalised, then optionally a Storage object. No new bucket needed.

### UI — the drafting console (`/dashboard/draft`, + entry points)

Two-pane console (matches the app's case-console / copilot patterns):
- **Left — source**: the selected/uploaded document; show OCR provenance ("OCR: Tesseract,
  Gujarati, conf 0.71" / "source extracted X") and detected language; a "re-OCR with Vision"
  button.
- **Right — draft**: auto-detected **category → template** (with a dropdown to override),
  **sections** chips (auto, editable — the user override path), a **Generate** button, then the
  result rendered as **Assumptions · Presumptions · Clarifications needed · Draft (with bullets) ·
  Citations**, with per-section **regenerate** and an editable body. Footer: *"Assistive draft —
  not legal advice. Verify against the bare act and the official record before use."*
- **Entry points**: a "Draft a reply" action on any document in `/dashboard/documents` and on the
  case detail page; plus the standalone console for upload-then-draft.
- **Pending state** (keyless prod): show "drafting… (worker)" and poll the `draft_version` row,
  identical to how the agent's pending turns resolve.

---

## 6. Guardrails & provider-agnostic AI

1. **Assistive, never autonomous** (conventions #5). The agent **drafts**; it never sends, files
   to court, or deletes. Output status starts `draft`; finalisation is an explicit human action.
2. **Cite-or-abstain, gaps explicit.** Same discipline as `prompt.ts`: ground substantive content
   in the source doc + `legal_reference`/`deadline_rule` + (optional) precedent, cite inline `[n]`,
   and **surface what's missing as Clarifications/Assumptions rather than inventing** sections,
   facts, dates, or parties. Old↔new code mappings flagged "nearest, not identical" where relevant.
3. **"Not legal advice" everywhere** (convention #3) — on every draft and in saved-document
   metadata; plus OCR/source provenance (`provider, langs, confidence, last_synced_at`).
4. **Deterministic gates around the LLM.** Category forced into the taxonomy (`categoryOf`),
   sections resolved against the KB, template structure fixed in data — the LLM fills a frame, it
   doesn't choose the frame unsupervised.
5. **No PII in logs** (convention #4): never log document bodies / OCR text. Default OCR is
   on-box (Tesseract) so PII stays local; cloud OCR is opt-in per-tenant for non-sensitive scans.
6. **Provider-agnostic** (convention #7): drafting uses `completeText`/`completeJson` (any
   backend), OCR uses the new `OcrProvider` seam — both swappable by env, both with a keyless
   default so dev/prod don't burn credits.
7. **RLS on every new table** (`draft`, `draft_version`, `draft_template`) — the standard 4
   policies; the worker uses the admin client and filters by `tenant_id` manually.

---

## 7. Phased build order

- **P-A · OCR seam (the enabling capability).** `src/lib/docs/ocr/{types,index,tesseract}.ts`;
  wire into `extract.ts`'s `needsOcr` path; install Indic `traineddata` on the worker; add a
  `ocrPending()` tick to `classify-worker.ts` so uploaded scans get `parsed_text`. Persist OCR
  provenance. **Deliverable:** scanned Hindi/Gujarati docs become searchable text.
- **P-B · Drafting KB.** `draft_template` table + RLS + seed pack (notice-reply, written
  statement, bail, reply-to-order) + new-tenant seeding in `handle_new_user()`. Static
  category→section map in code. **Deliverable:** the "baked skill" data.
- **P-C · Drafting agent.** `src/lib/services/draft/{retrieve,prompt,draft}.ts` — section
  identification (deterministic-first), grounded retrieval (reuse `retrieve.ts` helpers),
  `completeText` synthesis into the assumptions/presumptions/clarifications/bullets shape; `draft`
  + `draft_version` tables; sync + worker-queued execution. **Deliverable:** generate a cited
  draft for a given document via a server action.
- **P-D · Console UI.** `/dashboard/draft` two-pane, entry points on documents + case detail,
  override controls, version history, "save as document". **Deliverable:** the visible feature.
- **P-E · Quality tier.** Google Vision OCR fallback (`google-vision.ts` + auto-confidence
  routing); optional precedent grounding in drafts; per-section regenerate; bilingual output.

Ship + checkpoint after each phase (project build-phase rule).

---

## 8. Summary (≈15 lines)

- Build a **drafting agent**: take any document in the system (or uploaded), read it even if it's
  a **scanned image in any Indian language**, identify the right **category + sections under
  Indian law**, and produce a **cited draft** with **assumptions / presumptions / clarifications /
  bullets** — automatic unless the user fixes the sections.
- ~70% reuses existing seams: `extract.ts`, `categories.ts`, `complete.ts` (`completeText`),
  the agent's retrieve→prompt→cite-or-abstain pattern, the KB seeds, the `documents` bucket, and
  the keyless self-hosted worker. New surface = **OCR**, a **drafting-convention KB**, **draft
  data model + console**, and the **drafting-agent service**.
- **Pipeline:** ingest/upload **[D]** → digital-vs-scanned via `needsOcr` **[D]** → unpdf OR
  **OCR** **[D]** → language detect **[D]** → classify category **[L→D]** → identify sections
  (deterministic map + KB; LLM only for ambiguity) → pick template **[D]** → grounded retrieval
  **[D]** → draft via `completeText` **[L]** → gate + persist + cite **[D]**. LLM infers,
  deterministic code verifies/files/gates.
- **OCR pick:** **default self-hosted Tesseract 5 + Indic `traineddata`** (keyless, free,
  private, good on clean ≥300 DPI Indic scans), with **Google Cloud Vision
  `DOCUMENT_TEXT_DETECTION`** as the configured-key quality fallback (officially supports Hindi +
  Gujarati, strong on hard scans). **AWS Textract is ruled out — no Indic support.** Behind an
  `OcrProvider` interface, env-routed, exactly like our LLM layer.
- **KB as data:** drafting conventions live in a `draft_template` seed table (RLS, seeded per
  tenant) — structured skeleton + required points + section hooks — so the skill is maintained,
  cited, and reviewable, not improvised prose.
- **Guardrails:** assistive-only (never auto-send/file), cite-or-abstain with gaps surfaced,
  "not legal advice" + provenance everywhere, no PII in logs (OCR on-box by default), RLS on
  every new table, fully provider-agnostic with keyless defaults.

### Recommended first slice

**P-A: the OCR seam** — `src/lib/docs/ocr/*` (Tesseract default behind `OcrProvider`), wired into
`extract.ts`'s existing `needsOcr` branch and a new `ocrPending()` tick in the worker, with OCR
provenance persisted to `document.extracted.ocr`. It is the one genuinely new, blocking capability
(everything downstream needs real text); it's self-contained, keyless, testable on a Hindi/Gujarati
scan, and immediately improves search/classification even before the drafting UI exists.

### OCR pick (one line)

**Self-hosted Tesseract 5 + Indic `traineddata`** (default, keyless) → **Google Cloud Vision
`DOCUMENT_TEXT_DETECTION`** (key-gated fallback for hard scans); **not AWS Textract** (no Indic).
