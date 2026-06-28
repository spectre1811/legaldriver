# Court-corpus analysis + product layer: what a Gujarat/India corpus unlocks

**Date:** 2026-06-28 · **Status:** proposed (design only — no migrations in this doc)
**Builds on:** `2026-06-25-court-data-sourcing.md` (how we *get* the corpus, compliantly),
`2026-06-24-court-data-strategy.md` (the hard line), and the existing app seams listed below.

## ~12-line summary

We now assume a **shared, read-only court-data corpus** (Gujarat-first, India-wide over time):
cases + status/history, cause lists, full-text judgments, and **resolved entities** (parties,
advocates, judges, courts, acts/sections). It lives in its own schema (`corpus.*`), is owned by
no tenant, and is the *system of record for public record* — strictly separate from each tenant's
private `matter`/`document` data. It turns seven existing-but-thin features into real ones:
(1) **similar-case discovery at scale** — today `src/lib/court/similar.ts` only sees the tenant's
own matters; the corpus lets it find precedent across all of Gujarat. (2) **judge/bench/court
behavioural patterns**, (3) **advocate analytics**, (4) **act/section trend analysis**, (5)
**limitation/deadline intelligence from real timelines** (calibrating the seeded `deadline_rule`
spine against observed disposal times), (6) **case lifecycle/status timelines**, and (7) **FTS +
semantic search over judgments**, which finally grounds the Lawyer Agent in *real precedent*
instead of only the curated `legal_reference` pack. Tech: Postgres FTS + pgvector (reuse the
self-hosted **bge-small-en-v1.5 / 384-dim** embedder we already run), materialized views for the
analytics, GIN/HNSW indexes — **no OpenSearch** at this scale. Everything AI stays assistive,
cited, "not legal advice"; the corpus never leaks one tenant's private matter into another's view.

---

## 0. Grounding — the seams this plugs into (read before designing)

| Seam | File / object | What it does today | What the corpus changes |
|---|---|---|---|
| Similar-case | `src/lib/court/similar.ts` | GIN-overlap on `matter.{party,advocate,judge,act}_names`, **tenant-scoped only** | Add a corpus-backed mode: same scoring, vastly larger candidate pool |
| Lawyer Agent retrieval | `src/lib/services/agent/retrieve.ts` | Pulls `legal_reference` (curated pack) + tenant `matter`/`document`/`order`; doc semantic search via `match_document_chunks` | Add a **judgments** retrieval source (FTS + pgvector) → real precedent citations |
| Embeddings | `src/lib/services/agent/embed.ts` | `Xenova/bge-small-en-v1.5`, 384-dim, mean-pooled, normalized, worker-only | Reuse verbatim for judgment chunks — same model, same dims, same HNSW ops |
| Semantic match RPC | `0012` `match_document_chunks(tenant,emb,k)` | tenant-scoped cosine NN over `document_chunk` | Mirror as `match_judgment_chunks(emb,k,filters)` — **no tenant arg** (corpus is global) |
| Analytics | `0016` `analytics_summary()` | per-tenant headline counts, `SECURITY DEFINER`, every subquery filtered by `current_tenant_id()` | Pattern to copy for corpus RPCs — except corpus RPCs read only public data, so no tenant filter needed |
| Deadline rules | `0015` `deadline_rule` seed | curated Indian limitation/procedure rules | Calibrate against **observed** timelines in the corpus |
| Court cache | `0010` `court_cache` (kind/cache_key/provider/raw/normalized) | HITL/provider-fetched per-case JSON, no tenant | The corpus is the *durable, entity-resolved* layer this cache feeds into |
| App surfaces | `src/app/dashboard/{cases,cause-list,copilot,analytics,calendar}` | existing pages | each feature below names where it lands |

**Hard separation, restated:** `corpus.*` = public record, no `tenant_id`, read-only to the app,
written only by trusted ingest workers (service role). `public.matter` etc. = private, RLS by
`current_tenant_id()`. A feature may *read corpus + the tenant's own matters in one query*, but
must never expose another tenant's `matter`/`document`/`notice` rows. Corpus rows are public, so
showing them across tenants is fine — that is the whole point.

---

## 1. The corpus schema (target shape)

A separate `corpus` schema keeps the public/private line obvious and lets us grant
`select` to `authenticated` on corpus tables without entangling RLS.

```
corpus.court           (id, code, name, type {sc,hc,district,tribunal}, state, district, parent_id)
corpus.judge           (id, name_norm, aliases[], court_id)          -- resolved entity
corpus.advocate        (id, name_norm, aliases[], bar_reg?)          -- resolved entity
corpus.party           (id, name_norm, aliases[], kind {person,org,state})
corpus.act             (id, name, short_name, year)                  -- e.g. NI Act 1881
corpus.section         (id, act_id, number, title)                   -- e.g. s.138
corpus.case            (id, cnr unique, court_id, case_type, number, year,
                        filed_date, disposed_date, status, stage, last_synced_at, source)
corpus.case_event      (id, case_id, date, kind {hearing,order,filing,disposal},
                        purpose, judge_id?, next_date?)               -- the lifecycle timeline
corpus.case_party      (case_id, party_id, role {petitioner,respondent,...})
corpus.case_advocate   (case_id, advocate_id, side)
corpus.case_act        (case_id, act_id, section_id?)
corpus.judgment        (id, case_id?, court_id, judge_ids[], date, citation, title,
                        outcome?, fts tsvector, source, license)     -- full text
corpus.judgment_chunk  (id, judgment_id, ord, content, embedding vector(384))
```

Provenance (`source`, `last_synced_at`, `license`) on every ingested row — same rule as
tenant court data. Attribution carried where the source license (CC-BY-4.0 for e-SCR,
ODbL for DevDataLab, Indian Kanoon terms) requires it.

---

## 2. Features, prioritized by value / effort

Scored **V** (value to an advocate) and **E** (effort) 1–5; roadmap order = high V, low E first.
Each names the app surface and the supporting tech.

### P1 — Judgment search + Agent grounding in real precedent · **V5 / E3** ← do first
The single biggest unlock: the Lawyer Agent currently grounds on a hand-curated
`legal_reference` pack (~dozens of rows). With judgments it cites **actual decisions**.
- **Tech:** `corpus.judgment.fts` (Postgres `tsvector`, GIN) for keyword/citation lookup +
  `corpus.judgment_chunk.embedding` (bge-small, 384-dim, HNSW `vector_cosine_ops`) for
  semantic recall — *identical* pipeline to `document_chunk` (reuse `embed.ts`, `chunkText`).
- **Integration:** add a `judgment` source to `retrieve.ts`. New RPC
  `match_judgment_chunks(p_embedding text, p_k int, p_court text?, p_act text?)` — mirrors
  `match_document_chunks` but **drops the tenant arg** (corpus is global). Hybrid rank:
  FTS for exact section/citation hits, vector for "cases like this". Hits flow through the
  existing `[n]` citation machinery in `prompt.ts` / `agent.ts` unchanged.
- **Surface:** `/dashboard/copilot` (answers gain precedent citations) + a new
  "Precedent search" tab on the case console.
- **Guardrail:** every judgment hit carries `citation` + `source` + `date`; the Agent's
  "not legal advice — verify against the bare act" footer already enforced in `prompt.ts`.

### P2 — Similar-case discovery at scale · **V5 / E2** ← cheapest big win
`similar.ts` already has the scoring model (weighted overlap on parties/acts/advocates/judges);
it just can't see beyond the tenant. The corpus removes that ceiling.
- **Tech:** GIN indexes on the corpus join tables (or denormalized `corpus.case.*_names[]`
  arrays mirroring `matter`'s, so we reuse the exact `overlaps()` probes). Add semantic
  similarity as a second signal: nearest judgments by chunk embedding.
- **Integration:** new `findSimilarFromCorpus(facets, filters)` alongside `findSimilarCases`;
  same `SimilarCase` shape + `WEIGHT` constants, candidate pool = `corpus.case`. The case
  console can show **both** "your related matters" and "related public cases / precedent".
- **Surface:** case detail "Similar cases" panel (already exists for tenant scope — add the
  corpus section underneath).
- **Guardrail:** corpus results are public; never co-mingle the *scoring* of a tenant's private
  facets into a shared index — facets are passed as query params, never persisted to `corpus.*`.

### P3 — Case lifecycle / status timeline · **V4 / E2**
`corpus.case_event` is a ready-made timeline. For any tracked CNR, show the *real* procedural
history (filing → hearings → orders → disposal) even for portions the tenant hasn't HITL-fetched.
- **Tech:** straight indexed read on `corpus.case_event (case_id, date)`; no ML.
- **Integration:** the case console's history view reads tenant `hearing` + corpus
  `case_event`, deduped on date/kind. Stamp provenance per row.
- **Surface:** `/dashboard/cases/[id]` history tab; feeds the calendar.

### P4 — Limitation / deadline intelligence from real timelines · **V4 / E3**
The `deadline_rule` spine (0015) is statutory *theory*. The corpus shows **observed reality**:
how long, in this court, between summons→written-statement, or filing→first-hearing.
- **Tech:** materialized view `corpus.mv_stage_durations` (court_id × case_type × event-pair →
  p50/p90 days), refreshed nightly. Pairs deterministic statutory deadlines with empirical
  "typical" windows.
- **Integration:** the deadline engine keeps computing the *legal* due date from `deadline_rule`
  (deterministic, unchanged); the corpus adds an advisory "in this court, this stage typically
  takes ~X days (p50)" annotation. Never overrides the statutory date.
- **Surface:** deadline cards on the case console + calendar.
- **Guardrail:** clearly labelled "observed pattern, not a legal limit"; the binding number
  stays the statutory one.

### P5 — Judge / bench / court behavioural patterns · **V4 / E4**
Aggregate `corpus.case` + `case_event` + `judgment` by `judge_id` / `court_id`: disposal rates,
median time-to-disposal, grant/dismiss tendencies on a given act/section (e.g. anticipatory bail
under BNSS s.482), adjournment frequency.
- **Tech:** materialized views `corpus.mv_judge_stats`, `corpus.mv_court_stats`
  (SECURITY-INVOKER, public data → no tenant filter), refreshed nightly. Outcome extraction on
  `judgment.outcome` populated at ingest (deterministic where the corpus provides it; LLM-assisted
  classification → `needs_review` where it doesn't — *Claude infers, code commits*).
- **Surface:** a "Bench insights" panel on the case console (keyed to the matter's judge/court) +
  a `/dashboard/analytics` corpus section.
- **Guardrail:** descriptive statistics only, framed as "historical pattern, not prediction";
  no per-judge "scorecard" framing that implies bias. Sample-size floor (hide n<20).

### P6 — Advocate analytics · **V3 / E3**
By `advocate_id`: matter volume, court/act mix, appearance frequency. Two uses: a firm
benchmarking itself ("you appear mostly in NI-138 at Ahmedabad district"), and **opponent
intel** (the advocate on the other side of a tracked matter).
- **Tech:** `corpus.mv_advocate_stats`, same MV pattern.
- **Surface:** case console (opposing-counsel card) + analytics.
- **Guardrail:** public-record aggregates only; **DPDP minimisation** — no inferred/derived
  personal attributes (no "win rate" leaderboards that could defame). Aggregate, sample-floored.

### P7 — Act / section trend analysis · **V3 / E2**
Filing volumes and outcomes over time by act/section and court — e.g. NI-138 filings trend in
Gujarat, or post-BNS adoption of new sections.
- **Tech:** `corpus.mv_act_trends` (act_id/section_id × court × quarter → counts/outcomes).
- **Surface:** `/dashboard/analytics` (a market/practice-area view); also informs the
  `practice_area` seed.
- **Guardrail:** aggregate, public; pair with the IPC↔BNS / CrPC↔BNSS mapping the Agent already
  handles so trends span the code transition.

**Roadmap order:** P1 → P2 → P3 → P4 → P5 → P6 → P7. P1+P2+P3 are the "ship first" cluster
(highest value, lowest effort, all reuse existing code paths). P4–P7 are the analytics layer,
gated on enough ingested volume to be statistically honest.

---

## 3. Supporting tech decisions

- **Embeddings:** keep **bge-small-en-v1.5, 384-dim**, mean-pooled + normalized, via the
  worker-only `transformers.js` path in `embed.ts`. Do **not** introduce a second model — same
  vector space lets us, if ever useful, compare tenant docs and corpus judgments. bge's query
  instruction prefix (`embedQuery`) and HNSW `vector_cosine_ops` carry over unchanged. (English
  bias is acceptable: Indian judgments are predominantly English; revisit multilingual only if
  Gujarati-script judgment text becomes a real fraction of the corpus.)
- **Search infra:** **Postgres FTS + pgvector, not OpenSearch.** Justification: we already run
  pgvector (0012) and FTS (`document.fts`); the corpus is bounded (Gujarat-first, demand-driven,
  not "all of India day one"); hybrid FTS+vector in one DB avoids a second system, a second
  sync pipeline, and a second place to enforce provenance. Reassess OpenSearch only if judgment
  full-text crosses ~tens of millions of rows *and* FTS latency degrades — not before.
- **Indexes:** GIN on every `tsvector` (`judgment.fts`) and on denormalized `*_names[]` arrays
  (for the `overlaps()` reuse); HNSW (`vector_cosine_ops`) on `judgment_chunk.embedding`; btree
  on `case(cnr)`, `case_event(case_id,date)`, and all MV group-by keys.
- **Materialized views** for all analytics (P4–P7): nightly `refresh ... concurrently`, never
  computed per-request. RPCs read the MVs (cheap), mirroring the single-round-trip pattern of
  `analytics_summary()`.
- **RPCs:** `match_judgment_chunks`, `similar_corpus_cases`, `judge_stats`, `court_stats`,
  `advocate_stats`, `act_trends` — all `stable`, reading only `corpus.*` (no tenant filter, no
  `SECURITY DEFINER` needed since the data is public; grant `execute`/`select` to `authenticated`).
- **Ingest:** trusted worker (service role), keyed on **CNR** as the canonical id (per C5 of the
  sourcing doc). Entity resolution (judge/advocate/party name → resolved id) is LLM-assisted,
  code-committed, low-confidence → `needs_review`. Sources: e-SCR bulk (judgments), Indian Kanoon
  API (on-demand judgments/citations), DevDataLab (historical district backbone), India Code
  (acts/sections), HITL-parsed case pages (live status). All already vetted in the sourcing doc.

---

## 4. Guardrails (carry from the build brief + sourcing doc)

1. **Tenant isolation is sacrosanct.** `corpus.*` has no `tenant_id` and is read-only to the app.
   A tenant's private `matter`/`document`/`notice`/`client` data is **never** written into the
   corpus and never surfaced to another tenant. Cross-tenant exposure risk = zero by construction
   (private tables keep their 4 RLS policies; corpus tables expose only public record).
2. **Public record ≠ unrestricted.** Apply **DPDP hygiene** regardless of the court-records
   exemption debate: minimisation (store only fields a feature uses), purpose limitation, no PII
   in logs, aggregate-with-sample-floor for any person-level analytics (judges, advocates,
   parties). No derived/inferred personal attributes; no defamatory "scorecards".
3. **AI is assistive, cited, not advice.** Every corpus-grounded Agent answer keeps the inline
   `[n]` citations and the "not legal advice — verify against the official record and the bare
   act" footer already enforced in `prompt.ts`. The Agent never auto-acts.
4. **LLM infers, code commits.** Entity resolution and outcome classification at ingest are
   LLM-assisted; deterministic code writes the row; low-confidence → `needs_review`. No
   auto-merge of ambiguous entities.
5. **Provenance everywhere.** `source` + `last_synced_at` + `license` on every corpus row; the UI
   shows "source: <X>, last refreshed <date>" + the verify disclaimer, same as tenant court data.
6. **Statistical honesty.** Behavioural/analytics views are descriptive history, never prediction;
   hide samples below a floor (n<20); label observed timelines as patterns, not legal limits — the
   binding deadline stays the statutory `deadline_rule` value.

---

## 5. What this doc does *not* do

Design only — no migrations, no code. Sourcing/compliance of the corpus itself is settled in
`2026-06-25-court-data-sourcing.md` (HITL + free/near-free legitimate corpora; no scraping, no
CAPTCHA). This doc assumes that corpus exists and specifies the **analysis + product layer** on
top of it. Implementation lands as `corpus.*` migrations + the RPCs/MVs above + `retrieve.ts` and
`similar.ts` extensions, phased P1→P7.
