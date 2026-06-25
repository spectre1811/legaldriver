# Court-data sourcing: building our own datastore, keyless and compliant

**Date:** 2026-06-25 · **Status:** accepted (research + phased plan)
**Supersedes nothing; extends** `2026-06-24-court-data-strategy.md` with concrete sources,
challenges, and a phased build plan.

## Why this doc

`2026-06-24-court-data-strategy.md` set the hard line (no scraping, no CAPTCHA solving) and
the high-level shape (own datastore + provider interface). This doc does the homework: it maps
**which Indian court-data sources actually exist**, which are **free + compliant**, which are
**off-limits**, and lays out a **phased plan to grow our own datastore** without a paid API and
without violating anyone's terms. It is honest about where there is simply **no free/compliant
path today** (those go to the backlog as blocked).

## Hard constraints (restated — non-negotiable)

- **No automated CAPTCHA solving or bypass**, no third-party captcha-bypass scrapers.
- **No headless bot-scraping** that circumvents protections on `services.ecourts.gov.in` /
  `hcservices.ecourts.gov.in` / `dcourts.gov.in`.
- Resilience model we already use: **own-cache datastore + multi-provider routing + a
  human-in-the-loop (HITL) refresh** — the *user* solves any CAPTCHA on the official portal and
  we parse what they bring back (pasted text, downloaded PDF/HTML).

---

## 1. The official eCourts ecosystem — what exposes data, and how

### 1a. eCourts Services portals (case status, orders, cause lists) — CAPTCHA-gated, no public API
- `https://services.ecourts.gov.in/` (district/taluka), `https://hcservices.ecourts.gov.in/`
  (High Courts), `https://dcourts.gov.in/` (newer district portal). Free to a human; **every
  query is behind an alphanumeric CAPTCHA** and the terms prohibit automated access. There is
  **no public, keyless API** for case-status / cause-list here. This is the data we most want
  (live hearing dates) and the hardest to get compliantly. **Off-limits to automate.**

### 1b. NJDG — National Judicial Data Grid (aggregate stats + a restricted Open API)
- `https://njdg.ecourts.gov.in/` (district + HC), `https://scdg.sci.gov.in/scnjdg/` (Supreme
  Court). Covers ~18,700 District & Subordinate courts + HCs, near-real-time pendency/disposal.
- Per the Department of Justice and e-Committee, NJDG provides an **Open API under the NDSAP**
  policy — but access is granted to **Central/State Government departments via a departmental
  ID + access key** for *institutional litigants*, with "plans to extend to non-institutional
  litigants in future." Refs: `https://www.doj.gov.in/the-national-judicial-data-grid-njdg`,
  `https://ecommitteesci.gov.in/service/national-judicial-data-grid/`.
- **Reality for us:** NJDG is excellent for **aggregate dashboards** (pendency by court/state),
  not for per-case tracking, and the API is **not open to a private SaaS today**. Good for
  reference/coverage stats; **not** a case-status feed. Apply only if/when we qualify.

### 1c. eCourts Services mobile app + its web-service endpoints ("Kleopatra"-style)
- The official Android/iOS app (`in.gov.ecourts.eCourtsServices`) and its help/FAQ
  (`https://services.ecourts.gov.in/App/apphelp.html`) talk to internal NIC web services keyed
  on the **16-digit CNR**. These endpoints are **not a published open API**, are **not
  licensed for third-party use**, and reverse-engineering them to drive automated pulls is the
  same ToS/anti-bot problem as scraping the web portal. Third-party APIs (e.g.
  `court-api.kleopatra.io`, `eciapi.akshit.me`) front exactly these flows. **Off-limits to
  replicate ourselves.**

### 1d. Supreme Court judgments — e-SCR (free, bulk-friendly)
- e-SCR = electronic Supreme Court Reports, **free, no subscription**, ~34,000+ reported
  judgments 1950→present. Portals: `https://scr.sci.gov.in/`,
  `https://judgments.ecourts.gov.in/pdfsearch/index.php`, SC site + mobile app.
- **This is a genuinely open, compliant text corpus.** Caveat: the *interactive* search portal
  still uses a CAPTCHA, but the data itself is published free and also mirrored in bulk by the
  community (see §3). Use the bulk mirror, not the CAPTCHA UI.

### 1e. Judgments & Orders portal (SC + all HCs full text)
- `https://judgments.ecourts.gov.in/` — free full-text search across SC + High Court judgments,
  no login. **CAPTCHA on search.** Value is the documents (final judgments/orders), not live
  case status. Treat like e-SCR: great corpus, fetch via compliant/bulk routes, not bots.

### 1f. India Code — bare acts / statutes (free)
- `https://www.indiacode.nic.in/` — official digital repository of **all Central + State acts**
  and subordinate legislation (rules, notifications), free-text + structured browse (by act
  year/number). No published bulk API, but pages are stable, public, government-published
  reference law (not personal data). This backs our **jurisdiction/deadline rules** (limitation
  periods, act/section references) — high value, low risk.

### 1g. data.gov.in / OGD platform (judiciary datasets)
- `https://www.data.gov.in/sector/judiciary`, `https://www.data.gov.in/keywords/eCourt`. Hosts
  **periodic/aggregate** judicial datasets (e.g. court-wise pending-case counts vs NJDG) with
  documented dataset APIs. Useful for **reference/aggregate** layers and coverage planning;
  **not** a per-case or per-hearing live feed.

**Bottom line on official sources:** the *judgment/statute/aggregate* layers are free and
compliant; the *live per-case status + cause list* layer has **no keyless, compliant API** —
that gap is the core of this strategy.

---

## 2. How the commercial providers get their data — and what's off-limits for us

| Provider | What it sells | Most likely method | OK for us? |
|---|---|---|---|
| **eCourtsIndia** (`ecourtsindia.com/api`), **Kleopatra** (`court-api.kleopatra.io`, `eciapi.akshit.me`) | Real-time CNR/case-status/orders/cause-list API, JSON | Server-side automated fetch from the official portals incl. **CAPTCHA handling at scale** + proxies ("real-time, uncached") | **As a paid fallback only** (consume their API; we don't replicate their method) |
| **Vakeel360** (`vakeel360.com`) | Free case-status search + API | States data "fetched directly from court servers in real-time, 2–10s" → live automated fetch from official portals | **Consume only**, never imitate the fetch |
| **Apify "eCourt India scraper"** (`apify.com/parseforge/...`) | Scraper actor | Explicitly advertises **"built-in captcha bypass, headful/headless, proxy support"** | **Hard no** — this is exactly our forbidden method |
| **Indian Kanoon** (`indiankanoon.org`, `api.indiankanoon.org`) | Judgments/legal-text search **API** (see §3) | Aggregates published judgments | **Yes — legitimate API**, not a status feed |
| **kanoon.dev** (`docs.kanoon.dev`) | Dev-friendly legal data API | Aggregator over judgments/court data | Evaluate; consume-only if used |

**Rule:** we may *consume a provider's API* as a thin fallback (we're a customer, bound by
their terms, not the portal's anti-bot terms). We may **not** ourselves run the CAPTCHA-bypass
/ headless-bot method that produces that data. The line is "buy the output, don't reproduce the
prohibited input process."

---

## 3. Legitimate corpora we can actually ingest, keyless or near-free

- **Indian Kanoon API** — `https://api.indiankanoon.org/` (docs `/documentation/`, pricing
  `/pricing/`). Endpoints: `search`, `doc/<id>`, `origdoc/<id>` (court copy),
  `docfragment/<id>`, `docmeta/<id>`. Per-request micro-fees: **search ₹0.50, original doc
  ₹0.50, doc ₹0.20, fragment ₹0.05, metainfo ₹0.02**; **₹500 free on signup**; **non-commercial
  use ₹10,000/month free** (subject to admin verification). **Judgments/legal text only — NOT
  case-status / pending-case tracking.** Excellent for the documents/citations layer; near-free.
- **e-SCR bulk (community mirror)** — `https://github.com/vanga/indian-supreme-court-judgments`,
  hosted publicly on `s3://indian-supreme-court-judgments/`. ~35,000 SC judgments 1950→present,
  ~52 GB, PDFs + JSON/Parquet metadata, **CC-BY-4.0**. No auth, no CAPTCHA. **Best free,
  bulk-loadable SC judgment + metadata source we found.**
- **DevDataLab Judicial Data Portal** — `https://www.devdatalab.org/judicial-data`. **81.2M**
  district/lower-court case records **2010–2018** derived from eCourts, fully **anonymised**,
  released under **ODbL + Database Contents License**, downloadable (Dropbox). **Historical, not
  live**, and stops at 2018 — but a huge, legitimately-licensed backbone for analytics, entity
  resolution, and coverage maps. Extra fields on request.
- **India Code** (§1f) — statutes/bare acts for the rules engine.
- **data.gov.in judiciary** (§1g) — aggregate datasets via documented dataset APIs.
- **NOT applicable:** Free Law Project's bulk Supreme Court data (`free.law`) is **US SCOTUS,
  not India** — excluded.

---

## 4. The CAPTCHA / anti-bot reality (why scraping fails us twice)

1. **Compliance:** the eCourts portals' terms prohibit automated access; the CAPTCHA exists
   precisely to enforce human-only use. Automating around it is a ToS breach for a product that
   *also* custodies sensitive client + email data — unacceptable risk profile.
2. **Fragility:** CAPTCHAs harden, markup changes, IPs get rate-limited/blocked (industry-standard
   rate-limiting → CAPTCHA-or-hard-block escalation). A scraper is permanent cat-and-mouse
   maintenance — the opposite of a reliable "daily driver."
3. **Provenance:** scraped data has murky provenance and no SLA. Our brief *requires* showing
   "source + last refreshed" and a verify-against-official-record disclaimer — HITL-fetched or
   licensed-API data satisfies this cleanly; bot-scraped data does not.

This is why our model is **own-cache + multi-provider routing + HITL refresh**, not a scraper.

---

## 5. Legal / compliance angle

- **Public record vs bulk extraction:** individual case records are public, but the portals
  restrict *automated bulk extraction* via ToS + CAPTCHA. "Public to a human reader" ≠ "licensed
  for automated harvesting." Our HITL model keeps a human in the retrieval loop, respecting that.
- **DPDP Act 2023:** §3(c)(ii) exempts personal data the principal "made publicly available," and
  there's a separate exemption for processing by courts/judicial bodies. On a plain reading,
  court records sit largely outside DPDP. **But** the MeitY position (Rajya Sabha, Aug 2024) is
  that scraping public data still attracts IT Act + DPDP consent/transparency duties — i.e. **a
  live legal grey zone** for bulk scraping. Refs: `https://law.asia/india-data-scraping-regulation/`,
  `https://iapp.org/news/a/scraping-public-data-in-india-innovation-enabler-or-privacy-threat-`.
  Our stance: **don't operate in the grey zone.** Store only what a tenant is entitled to track
  for their own matters, show provenance + disclaimer, and apply DPDP hygiene (minimisation,
  no PII in logs, purpose limitation) regardless of the exemption debate.

---

## 6. Ranked challenges → suitable free/compliant solutions

Ranked by how much they block the product.

### C1 — No keyless/compliant API for live case-status & cause-list (the core gap) — **BLOCKED for free, today**
- *Why it's #1:* this is the daily-driver feature (next hearing dates, cause list). No official
  open API; the only API path is a **paid reseller** (eCourtsIndia/Vakeel360) whose own method
  is the forbidden one.
- *Compliant solutions:*
  - **HITL refresh (primary):** user opens the official portal, solves the CAPTCHA, and
    pastes/uploads the result (case page text or order/cause-list PDF). We **parse** it
    deterministically (Claude infers, code files) into `matter`/`hearing`/`cause_list_entry`.
    Zero ToS breach (a human did the lookup), zero cost.
  - **Manual + document-derived entry:** advocate adds/corrects a case by hand; we parse uploaded
    orders/cause-lists. 100% ours.
  - **Paid API as thin fallback only:** consume eCourtsIndia/Vakeel360 *as a customer* for
    bulk/auto refresh where the user opts in; never as our default, never replicating their fetch.
  - **NJDG Open API:** apply if we ever qualify as an institutional path (long shot for a SaaS).
- *Honest flag:* a **free, fully-automated, compliant live case-status feed does not exist.**
  Backlog item "auto case-status refresh without a paid API" = **blocked** pending NJDG opening
  to non-institutional users. Track DoJ/e-Committee announcements.

### C2 — CAPTCHA / anti-bot on every official query
- *Solution:* HITL (human solves it) + caching so we re-read our own store, not the portal. We
  never solve CAPTCHAs programmatically. (See §4.)

### C3 — Data freshness (hearings move; cause lists are daily)
- *Solution:* own datastore is the read path; **scheduled HITL refresh prompts** ("3 tracked
  matters not refreshed in 14 days — refresh now") + optional paid-API auto-refresh for opted-in
  tenants. Always stamp `source` + `last_synced_at` and surface staleness in the UI.

### C4 — Coverage across 700+ districts + 25 HCs + SC
- *Solution:* don't try to mirror everything. **Demand-driven cache:** we only ever store matters
  a tenant actually tracks. Seed reference/coverage from **DevDataLab** (district backbone,
  2010–2018) and **NJDG aggregates** for court lists/jurisdiction metadata. Judgments coverage
  from **e-SCR bulk** (SC) + **Indian Kanoon** (SC/HC/district/tribunals).

### C5 — Entity resolution / dedup (same case across CNR, party names, our manual entry, PDFs)
- *Solution:* **CNR is the canonical key** (16-digit, unique). Dedup on CNR; fall back to
  fuzzy (court + case-type + number + year + party names). DevDataLab + Indian Kanoon metadata
  give labelled examples to tune matching. Claude assists matching; code commits the merge;
  low-confidence → `needs_review`.
- *Honest flag:* full cross-court entity resolution at scale is hard — defer beyond per-tenant
  matters; it's not MVP-critical.

### C6 — Rate limits / blocks
- *Solution:* not our problem if we don't bot the portals. For Indian Kanoon / paid APIs, respect
  documented limits, cache aggressively, batch off-peak.

### C7 — ToS / legal risk
- *Solution:* the whole model above (HITL, consume-don't-reproduce, provenance + disclaimer,
  DPDP hygiene). Keep `docs/decisions/*` as the written record of the compliant posture.

### C8 — Statute / deadline reference data going stale
- *Solution:* periodic **India Code** + **data.gov.in** refresh of acts/sections feeding the
  jurisdiction-deadline rules. Low volume, low risk, government-published.

---

## 7. Phased plan to grow our own datastore (legitimately)

All phases write to **our Postgres as the system of record**; provenance (`source`,
`last_synced_at`) on every row; reads always hit our store, never a live portal.

- **Phase A — Reference + statute spine (free, now).** Load **India Code** acts/sections and
  **data.gov.in / NJDG** court lists + jurisdiction metadata to power deadline rules and a court
  directory. No PII, no ToS risk.
- **Phase B — Judgment/document corpus (free/near-free).** Bulk-load **e-SCR** (vanga S3 mirror,
  CC-BY-4.0) for SC judgments + metadata; wire **Indian Kanoon API** (₹500 free credit, micro-fees)
  for on-demand SC/HC/district judgment fetch + citations. Feeds the "related orders/judgments"
  and document-parsing features. Attribution where required.
- **Phase C — HITL case tracking (the owned live layer).** User pastes/uploads official
  case-status pages and order/cause-list PDFs; deterministic parse → `matter`/`hearing`/
  `cause_list_entry`, keyed on CNR. This is the compliant way to get *live* data into our own
  store. Add scheduled "time-to-refresh" nudges.
- **Phase D — Historical backbone (free, optional).** Ingest **DevDataLab** (81M cases,
  2010–2018, ODbL) as anonymised analytics/entity-resolution backbone + coverage maps. Keep it
  clearly separate from live tenant matters.
- **Phase E — Thin paid fallback (opt-in).** Behind `CourtDataClient`, offer
  `ECourtsIndiaClient`/`Vakeel360Client` as an **opt-in auto-refresh** for tenants who want it —
  we consume their API as a customer; it never becomes the default read path and never replaces
  the owned store.
- **Phase F — Official access (the real "own it").** Pursue NIC / e-Committee / NJDG structured
  access if/when extended to non-institutional users. Replaces the reseller for sourcing entirely.

HITL (Phase C) is the heart of the compliant live layer; the paid API (Phase E) stays a thin,
optional fallback; everything else is free.

---

## 8. What we can realistically do today, keyless

- **Build the statute/court-reference spine now** from India Code + data.gov.in + NJDG aggregates
  (Phase A) — free, no key, no ToS risk.
- **Bulk-load SC judgments today** from the `vanga` e-SCR S3 mirror (CC-BY-4.0) — free, no auth.
- **Stand up the HITL case-tracking flow** (paste/upload → parse → own store) — free, the only
  compliant way to get *live* per-case data without a paid key. This is the keystone.
- **Wire Indian Kanoon** with the free ₹500 credit to validate the judgment/citation layer at
  near-zero cost (it's an API key, but free to start).
- **Keep `MockCourtDataClient` as the dev default** so we never burn credits, with eCourtsIndia
  behind the same interface for the live demo.
- **Cannot do keyless today:** fully-automated live case-status/cause-list refresh — **no
  free/compliant path exists** (C1). Stays HITL or opt-in paid until NJDG opens up. Logged as a
  blocked backlog item.

---

## Sources

- NJDG: https://njdg.ecourts.gov.in/ · https://www.doj.gov.in/the-national-judicial-data-grid-njdg
  · https://ecommitteesci.gov.in/service/national-judicial-data-grid/ · https://scdg.sci.gov.in/scnjdg/
- eCourts portals: https://services.ecourts.gov.in/ · https://hcservices.ecourts.gov.in/ ·
  https://dcourts.gov.in/ · https://services.ecourts.gov.in/App/apphelp.html
- Judgments / e-SCR: https://judgments.ecourts.gov.in/ · https://scr.sci.gov.in/ ·
  https://github.com/vanga/indian-supreme-court-judgments (s3://indian-supreme-court-judgments/)
- Indian Kanoon API: https://api.indiankanoon.org/ · /documentation/ · /pricing/ · kanoon.dev: https://docs.kanoon.dev/
- India Code: https://www.indiacode.nic.in/
- OGD / data.gov.in: https://www.data.gov.in/sector/judiciary · https://www.data.gov.in/keywords/eCourt
- DevDataLab: https://www.devdatalab.org/judicial-data
- Providers: https://ecourtsindia.com/api · https://vakeel360.com/ · https://eciapi.akshit.me/ ·
  https://apify.com/parseforge/court-records-ecourt-india-scraper (CAPTCHA-bypass — off-limits)
- DPDP / legal: https://law.asia/india-data-scraping-regulation/ ·
  https://iapp.org/news/a/scraping-public-data-in-india-innovation-enabler-or-privacy-threat- ·
  https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf
- (Excluded: https://free.law/projects/supreme-court-data/ — US SCOTUS, not India)
