# Richer Indian / Gujarat court-data sources — origination & legitimate acquisition

**Date:** 2026-06-29
**Status:** Research / decision input
**Context:** LexDriver builds its own Indian court-data corpus (Gujarat focus), today seeded
from the AWS "Indian High Court Judgments" open bucket. This doc answers two questions:
(1) where eCourts data actually *originates*, and (2) every **legitimate** way to get *richer*
data without scraping eCourts or defeating its CAPTCHA.

> **Hard line (non-negotiable, restated):** No CAPTCHA solving or bypass. No scraping that
> circumvents access controls on `services.ecourts.gov.in` / `hcservices.ecourts.gov.in` or any
> court portal. Respect `robots.txt` and Terms of Use. Where the *only* available path is
> non-compliant, we say so plainly and do not take it. We consume **licensed APIs as a paying
> customer** and **open datasets under their licenses** — that is the whole game.
> (Re-affirms `docs/decisions/2026-06-24-court-data-strategy.md` and CLAUDE.md rule #2.)

---

## PART 1 — How eCourts itself originates its data

The core fact for a third party: **the courts are the primary source. Data is born from court
staff keying it in at the point of filing and after every hearing. A private company cannot
*be* the source — it can only consume what the courts publish downstream.** Here is the actual
pipeline.

### 1. CIS — the Case Information System (data entry at source)
- **CIS** is the case-management software installed at every computerised District/Taluka court
  (a separate **CIS-High Court** build runs at HCs). It is built and maintained by the
  **National Informatics Centre (NIC), Pune**, under the guidance of the **eCommittee of the
  Supreme Court of India**. It runs on a free/open-source stack (Ubuntu + PostgreSQL).
  ([eCommittee — CIS](https://ecommitteesci.gov.in/division/case-information-system-cis/))
- **The data is entered by court registry staff**, not generated automatically: at e-filing /
  filing scrutiny the case is registered (parties, advocates, acts & sections, FIR details for
  criminal matters); after each hearing a clerk records the business/next date, orders, and
  ultimately the disposal. This manual data entry at the court is the *origin event* for every
  field downstream (and the reason data quality varies court-to-court — see the NIPFP critique
  below).
- CIS evolved through versions (CIS 1.0 → **3.x**) under Phase II to standardise the National
  Core Period (the data model) across ~3,000+ court complexes.
  ([NIPFP WP 314/2020 — "Problems with the e-Courts data"](https://www.nipfp.org.in/media/medialibrary/2020/07/WP_314__2020.pdf))

### 2. Aggregation upward into NJDG
- Each court's local CIS database is **replicated to the National Judicial Data Grid (NJDG)**,
  which NIC operates as a **national data warehouse** of case details, orders and judgments.
  Stats are "updated every day by respective courts" / on a **near-real-time basis** by the
  connected District and Taluka courts.
  ([NJDG](https://njdg.ecourts.gov.in/) · [eCommittee — NJDG](https://ecommitteesci.gov.in/service/national-judicial-data-grid/))
- NJDG covers **18,735 District & Subordinate Courts and High Courts** and is the source behind
  the public pendency/disposal dashboards and the High-Court grid
  ([HC-NJDG](https://njdg.ecourts.gov.in/hcnjdg_v2/)).
  The Supreme Court onboarded its own data onto NJDG in Sept 2023, "completing the circle."
  ([PIB, 2023](https://www.pib.gov.in/PressReleasePage.aspx?PRID=1957318) ·
  [DoJ — NJDG](https://www.doj.gov.in/the-national-judicial-data-grid-njdg))

### 3. Who runs it — eCommittee + NIC + DoJ, across project phases
- **eCommittee, Supreme Court of India** = policy/design owner of the digital judiciary.
  **NIC** = builds and runs CIS, NJDG and the public services portals. **Department of
  Justice (DoJ), Ministry of Law & Justice** = funds it as a Centrally Sponsored Mission Mode
  Project and owns data-sharing policy.
- **Phase I (2007–2015):** hardware/LAN + first CIS rollout, staff trained on CIS.
  **Phase II (2015–2023):** CIS 3.x standardisation, NJDG, public services portal & apps, e-filing.
  **Phase III (2023–2027, ~₹7,210 cr):** an "**Open Digital Ecosystem**" — interoperable, API-driven,
  with stated intent to **open court data and publish open APIs** for an ecosystem of application
  providers (see Part 2, item B).
  ([Drishti — eCourts MMP](https://www.drishtiias.com/daily-updates/daily-news-analysis/e-courts-integrated-mission-mode-project) ·
  [Phase III Final Vision Report, 2024 (PDF)](https://cdnbbsr.s3waas.gov.in/s35d6646aad9bcc0be55b2c82f69750387/uploads/2024/07/202407161620804267.pdf))

### What this means for LexDriver
- We will **never originate "live" authoritative case data** — that requires being a court
  running CIS. Our corpus is necessarily **downstream**: open bulk dumps + licensed APIs +
  manual entry by users. Provenance discipline (CLAUDE.md rule #3 — `source` + `last_synced_at`
  + "verify against the official record") is therefore not optional; it is the honest description
  of what we are.
- The *only* legitimate "richer" levers are: (a) richer **published** datasets, (b) **authorized**
  programmatic access (NJDG API / Phase III open APIs once available), and (c) **licensed**
  commercial APIs. Everything else is scraping the source — out of bounds.

---

## PART 2 — Legitimate ways to acquire richer data (ranked)

### Ranked summary table

| # | Source | What data | Coverage | License / terms | Format & access | Cost | Compliance verdict |
|---|--------|-----------|----------|-----------------|-----------------|------|--------------------|
| 1 | **AWS `parquet_case_details`** (Indian HC Judgments bucket) | **Rich case metadata**: advocates, acts & sections, full hearing/listing history, linked cases, documents, disposal — incl. cases with *no* order | 25 HCs / 45 benches; "growing portion" (mobile-sourced), actively expanding | **CC-BY-4.0** | Parquet on public S3 `s3://indian-high-court-judgments/metadata/parquet_case_details/court=XX/bench=YYY/case_details-mobile.parquet`; `--no-sign-request`; query via Athena | **Free** | ✅ **Best legitimate richer source.** Open license, machine-friendly, the fields we lack. Join to judgment parquet on `cnr`. |
| 2 | **Indian Kanoon API** | Full judgment **text**, doc metainfo, **citations + cited-by**, paragraph classification, search | SC + all HCs + many tribunals (incl. Gujarat) | Commercial API ToS; per-call | REST/JSON; sign up at api.indiankanoon.org | Pay-as-you-go INR: search/orig-doc **₹0.50**, doc **₹0.20**, fragment **₹0.05**, metainfo **₹0.02**; **₹500** free credit; non-commercial up to ₹10k/mo | ✅ **Buy as a customer.** Licensed aggregator; we don't touch eCourts. Cheapest path to *judgment text + citation graph*. |
| 3 | **e-SCR / Indian SC Judgments AWS bucket** | SC judgments + metadata (English + regional) | SC, **1950–2025** (~34k reported + more) | **CC-BY-4.0** (AWS bucket); e-SCR portal "open access, free" | Parquet/JSON/ZIP on `s3://indian-supreme-court-judgments/`; portal at digiscr.sci.gov.in | **Free** | ✅ Open. Good for SC corpus + citation anchoring. |
| 4 | **AWS HC Judgments — base bucket** (already used) | Judgment PDFs + metadata (`court_code, title, judge, pdf_link, cnr, date_of_registration, decision_date, disposal_nature, court_name`) | 25 HCs, **1950 → ~Apr 2025**, ~17.8M records, ~1.25 TiB tars; daily updates | Open (AWS registry) | Parquet/JSON/tar on `s3://indian-high-court-judgments/` | **Free** | ✅ Already in use. Pair with #1 for the rich fields. |
| 5 | **Development Data Lab — district-court dataset** | District/subordinate court cases: filing/registration/hearing/decision dates, party names, judge, acts & sections, disposition | **All India lower judiciary, 2010–2018**, **81.2M cases** (incl. Gujarat by construction) | **ODbL** (DB) + **DbCL** (contents) — **share-alike** | Dropbox download + Google-Sheets metadata via devdatalab.org/judicial-data | **Free** | ⚠️ **Use with care.** Great historical district-court coverage incl. Gujarat, but **ODbL share-alike**: a derived *database* we publicly distribute must be offered under ODbL too. Internal analytics & display are fine; don't redistribute a derived DB without legal sign-off. Stale (≤2018). |
| 6 | **NJDG Open API** | Pendency/case stats; case detail for monitoring | National | Govt data-sharing (NDSAP); **departmental ID + access key** | API; apply via DoJ/NIC | Free (if eligible) | ⚠️ **Eligibility-gated.** Built for **Central/State Govt + institutional litigants** (banks, PSUs, local bodies). **A private SaaS does not qualify directly.** Possible only *via* an institutional partner (govt dept / institutional litigant). Pursue as a relationship, not a self-serve key. |
| 7 | **Phase III open APIs / Open Digital Ecosystem** | Court data + services via open APIs for "application providers" | National (future) | TBD data-protection framework | Open APIs (planned) | TBD | ⏳ **Future / strategic.** Explicitly names third-party app providers and open APIs. Not live yet — monitor and position to be an early adopter. |
| 8 | **Gujarat HC / `judgments.ecourts.gov.in` portals** | Judgments, daily orders, cause lists, display board, case status | Gujarat HC + districts | Disclaimer is **permissive-by-omission** (no licence, no copyright grant); but data sits behind **eCourts CAPTCHA** | Web UI; free full-text at judgments.ecourts.gov.in | Free | ⚠️ **Manual / read-only only.** Fine for a human to look up & for our manual-entry path. **Automated bulk scraping is out** (CAPTCHA = access control; no ToS grant of reuse). |
| 9 | **Manupatra / SCC Online** | Headnoted full-text judgments, statutes, citators — editorially enriched | SC + all HCs + tribunals (deep, incl. Gujarat) | Paid subscription / institutional licence; **bulk API by negotiation** | Web; API/bulk on contract | ₹₹₹ (enterprise) | ✅ Licensed publishers. Authorized but **expensive**; consider only if we need editorial headnotes/citator quality. Contact for API/bulk terms. |
| 10 | **"eCourts API" resellers** — eCourtsIndia, Kleopatra, Vakeel360, Surepass, Legitquest etc. | Live case status by CNR, parties, advocates, hearings, orders, cause lists | 700+ district courts, HCs, SC, tribunals | Vendor ToS | REST/JSON | Cheap per-call / monthly | ❌ **Avoid unless they prove authorized sourcing.** eCourtsIndia openly advertises *"live re-scrape of cases from official eCourts servers,"* and the reference scraper they descend from ships *"OCR-based captcha resolvers."* That = **CAPTCHA bypass + scraping the source**; the legal/ToS risk transfers to us as the consumer. Only consider one that can contractually demonstrate licensed/authorized access. |

### Notes per source

**1 & 4 — AWS Indian HC Judgments bucket (`vanga/indian-high-court-judgments`).**
The base `metadata/parquet` table has the judgment-level fields we already use. The **richer
`metadata/parquet_case_details/` table** is the prize: one row per **CNR**, carrying **advocates,
acts & sections, full hearing/listing history, linked cases, documents** and case info "never
exposed through the website," including cases disposed with no order. It is mobile-API-sourced,
**a growing portion** of the corpus (so coverage improves over time), CC-BY-4.0, free. Join to
the judgment table on `cnr`.
([dataset.md](https://github.com/vanga/indian-high-court-judgments/blob/main/opendata/docs/dataset.md) ·
[Athena tutorial](https://github.com/vanga/indian-high-court-judgments/blob/main/opendata/tutorials/ATHENA.md) ·
[AWS registry](https://registry.opendata.aws/indian-high-court-judgments/))

**2 — Indian Kanoon API.** Pricing confirmed on the official page; gives us full text + the
citation graph (citeList / citedbyList up to 50 each) and paragraph-type classification —
features we'd otherwise have to build. Licensed; we are a customer. Verify Gujarat HC & district
coverage during a paid spike test.
([pricing](https://api.indiankanoon.org/pricing/) · [docs](https://api.indiankanoon.org/documentation/))

**3 — e-SCR / SC bucket.** `s3://indian-supreme-court-judgments/`, ARN
`arn:aws:s3:::indian-supreme-court-judgments`, ap-south-1, **CC-BY-4.0**, 1950–2025, bi-monthly
refresh. Public portal: [digiscr.sci.gov.in](https://digiscr.sci.gov.in/).
([AWS registry](https://registry.opendata.aws/indian-supreme-court-judgments/))

**5 — DDL.** 81.2M lower-court cases 2010–2018, built by processing the eCourts portal (a
one-time research extraction, not something we'd replicate). **ODbL share-alike is the catch** —
fine to ingest and analyse, but distributing a derived public database triggers ODbL on our DB.
([devdatalab.org/judicial-data](https://www.devdatalab.org/judicial-data) ·
[ODbL](https://opendatacommons.org/licenses/odbl/) ·
["Big Data for Justice"](https://devdatalab.medium.com/big-data-for-justice-f53e0e14c9c9))

**6 — NJDG Open API.** Introduced 2020 under **NDSAP**, access via **departmental ID + access
key**, scoped to **Central/State Govt and institutional litigants** accessing *their own* case
portfolio for monitoring; expansion to non-institutional users only "proposed... in future." No
public self-serve form for private companies. **There is no web application form** — the route is
email to the **eCommittee, Supreme Court of India (`ecommittee@aij.gov.in`)** and/or the
**High Court Central Project Coordinator (CPC)** (for Gujarat the CPC follows the `cpc-<code>@aij.gov.in`
pattern listed on the HC-NJDG Contact-Us page). NIC designs/hosts/maintains the system.
([DoJ — NJDG](https://www.doj.gov.in/the-national-judicial-data-grid-njdg) ·
[HC-NJDG Contact Us](https://njdg.ecourts.gov.in/hcnjdg_v2/?p=home/footerlinks/cu))

**Proof that authorized court APIs exist (precedent to cite when we ask):** the **Kerala High
Court publishes an official API requisition SOP** for programmatic access to its DigiCourt data —
i.e. an HC can grant *authorized* API access through a proper requisition process. This is the
template to invoke when approaching Gujarat HC / eCommittee.
([Kerala HC API SOP (PDF)](https://ecourt.keralacourts.in/digicourt/api_docs/sop.pdf))

**Bonus open dataset — DAKSH (Gujarat HC explicitly covered).** DAKSH has collected daily
**cause-list** data since Jan 2015 from 6 High Courts including **Gujarat** (also Karnataka,
Hyderabad, Delhi, Madras, Orissa), plus High Court writ datasets — released under **ODbL 1.0 +
DbCL 1.0** (some other DAKSH sets are CC-BY-4.0). Free, registration-gated download. Same
share-alike caveat as DDL; analytics-grade, not live tracking, with acknowledged gaps. Useful as a
Gujarat-specific historical cause-list reference. ([DAKSH open data](https://www.dakshindia.org/open-data/) ·
[DAKSH database portal](https://database.dakshindia.org/))

**8 — Gujarat HC.** The [disclaimer](https://gujarathighcourt.nic.in/disclaimer) is "for general
information or use," disclaims liability, and grants **no reuse licence** — silence, not
permission. Cause list / display board / judgments pages
([causelist](https://gujarathighcourt.nic.in/causelist),
[boarddisplay](https://gujarathighcourt.nic.in/boarddisplay),
[gujaratijudgments](https://gujarathighcourt.nic.in/gujaratijudgments)) are viewable by humans.
The district data behind `services.ecourts.gov.in` / `hcservices.ecourts.gov.in` is **CAPTCHA-gated**
— automated retrieval is barred by us per the hard line. Treat all of this as **manual lookup +
manual-entry input only.** (`robots.txt` returned 403 to our fetch — absence of a readable robots
file is **not** consent to crawl.)

**10 — resellers.** Reference scraper `iamshouvikmitra/bharat-courts` advertises "OCR based
captcha resolvers"; eCourtsIndia advertises "live re-scrape... from official eCourts servers."
That is exactly what rule #2 forbids; consuming it doesn't launder the violation.

---

## What to pursue next (concrete)

1. **Ingest `parquet_case_details` now (highest-leverage, zero-cost).** Add an Athena/S3 sync of
   `s3://indian-high-court-judgments/metadata/parquet_case_details/` for Gujarat (`court=` Gujarat
   codes), join to existing judgment parquet on `cnr`, and map **advocates / acts & sections /
   hearing history / linked cases** into our case model. CC-BY-4.0 → just attribute. Re-run on the
   daily cadence to ride its expanding coverage.
2. **Spike Indian Kanoon API** with the ₹500 free credit: pull a sample of Gujarat HC + district
   judgments to validate full-text + citation-graph coverage and quality; decide whether to wire it
   behind our `CourtDataClient` interface as the "judgment text + citations" provider. Pay-as-you-go,
   trivial to budget. Sign-up + contact: **https://api.indiankanoon.org/** (see /contact).
3. **Backfill historical district coverage from DDL (2010–2018)** for analytics/UX (e.g. base-rate
   timelines) — but **quarantine it** from any database we publicly redistribute until we have ODbL
   sign-off. Download: devdatalab.org/judicial-data.
4. **Open an authorized-access conversation, not a scrape.** Email the **eCommittee, Supreme Court
   of India (`ecommittee@aij.gov.in`)** and the **Gujarat HC Central Project Coordinator
   (`cpc-<gujarat-code>@aij.gov.in`, from the HC-NJDG Contact-Us page)** asking (a) whether a
   legaltech can obtain NJDG API access directly or must partner with an institutional litigant, and
   (b) the Phase III open-API onboarding timeline for application providers. **Cite the Kerala HC
   DigiCourt API SOP as precedent** that an HC can grant authorized API access through a requisition
   process. Also loop the DoJ eCourts division (https://www.doj.gov.in/the-national-judicial-data-grid-njdg)
   and eCommittee site (https://ecommitteesci.gov.in/). If Yash has a friendly **bar council /
   law-school / institutional litigant (bank/PSU/govt dept)** relationship, that is the realistic
   NJDG-API route.
5. **Keep manual-entry as the Gujarat district fallback** (rule #2): for cases not in the open
   buckets, a human enters by CNR; we never automate against the CAPTCHA-gated portal.
6. **If we ever need editorial headnotes/citator depth**, request **Manupatra/SCC Online** API/bulk
   licensing terms — but only as a paid, contracted feed, and only if the open sources prove
   insufficient.

---

## Executive summary (~15 lines)

- **Origin (Part 1):** eCourts data is *born* at the courts — registry staff key it into **CIS**
  (built/run by **NIC**, governed by the **SC eCommittee**) at filing and after every hearing;
  each court's CIS DB replicates up to **NJDG**, the national warehouse (18,735 courts).
- **Implication:** we can never *be* the source; LexDriver is inherently a **downstream consumer**.
  Provenance + "verify against the official record" isn't decoration — it's the truth of our model.
- **Richest free, open, license-clean source = the AWS bucket's `parquet_case_details` table**
  (CC-BY-4.0): advocates, acts & sections, hearing history, linked cases — exactly the fields we
  lack — keyed by CNR, across 25 HCs and **actively expanding**. We already use its sibling table.
- **Best licensed add-on = Indian Kanoon API** (₹0.20/doc, ₹0.05/fragment, ₹500 free credit) for
  full judgment text + citation graph — bought as a customer, no eCourts contact.
- **e-SCR / SC bucket** (CC-BY-4.0, 1950–2025) and **DDL** (81M district cases 2010–2018, but
  **ODbL share-alike** — don't redistribute a derived DB) round out history.
- **NJDG Open API** exists but is **gov/institutional-litigant only** — reachable for us only via
  an institutional partner; **Phase III** promises open APIs to third-party app providers (future).
- **Hard line holds:** the cheap "eCourts API" resellers (eCourtsIndia, Kleopatra, Vakeel360,
  Surepass) largely **re-scrape eCourts and bypass its CAPTCHA** — forbidden, and the risk transfers
  to us. Gujarat HC/district portals are **manual-lookup only** (CAPTCHA + no reuse licence). No
  CAPTCHA bypass, ever; manual entry is the fallback.

> **Single highest-leverage legitimate move:** **Ingest the AWS open bucket's `parquet_case_details`
> table** (`s3://indian-high-court-judgments/metadata/parquet_case_details/`, CC-BY-4.0, free) and
> join it to our existing judgment data on `cnr`. It is the one move that gives us *materially
> richer* fields — advocates, acts & sections, hearing history, linked cases — with zero cost, a
> clean licence, no eCourts contact, and coverage that grows on its own.

---

## Appendix: How eCourtsIndia (private) sources its data

**Date added:** 2026-06-29 · **Type:** competitive / diligence research · **Subject:** the
*private commercial vendor* at `ecourtsindia.com` (API host `webapi.ecourtsindia.com`) — NOT the
government eCourts/NIC project. All findings below are from the vendors' own public marketing/API
docs, the relevant open-source repos, and the official eCourts policies.

### 1. Method of acquisition — their own words: a live re-scrape of the government portals

eCourtsIndia's own API marketing page describes the mechanism explicitly:

> "The API **forces a live re-scrape** of any case **from official eCourts servers** with updated
> data ready in **5–10 seconds**." — paraphrased from [ecourtsindia.com/api](https://ecourtsindia.com/api)
> (the page itself 403s to bots; this is the indexed marketing copy returned by search).

They simultaneously claim the data is "**sourced from the official court backends of the
e-Committee, the Supreme Court registry, and individual High Court portals**" and offer
"certified true copy PDFs … digitally signed from the eCourts system." Their docs
([ecourtsindia.com/api/docs](https://ecourtsindia.com/api/docs)) expose endpoints like
`GET /api/partner/case/{cnr}` returning parties/advocates/judges/hearing history/orders/IAs, with
CNRs "auto-validated and deduplicated, with updated data ready in ~30s — perfect for nightly sync
jobs." There is **no claim of a licensed feed, MoU, or NJDG API access anywhere** — only that they
"re-scrape … from official eCourts servers." That is option **(a): automated scraping of the
official portals**, on demand, with the freshness window (5–30s) that only live re-scraping
produces. A genuine licensed feed would be described as a feed/license, not a "re-scrape."

Peers describe the same thing in thinner language:
- **Vakeel360** ([vakeel360.com/api](https://vakeel360.com/api)): "**Live data directly from court
  servers. No caching, no delays.** All data is fetched in **real-time directly from court
  servers**." No mention of any license or authorization.
- **Surepass** ([surepass.io/ecourts-api](https://surepass.io/ecourts-api/)): "Our system checks
  the information from the board department … results within seconds … 100% accurate and updated."
  No license claim.
- **Kleopatra** ([court-api.kleopatra.io](https://court-api.kleopatra.io/)): "free … real-time
  court case tracking" for "research and education" — same downstream pattern, no authorization
  claim. (Note `eciapi.akshit.me` / "E-Courts India API" is the same family of community/reseller
  wrappers around the portals.)

None of these is the government. None claims a license. All claim the one thing a licensed feed
cannot uniquely give you and a scraper does: an **on-demand, seconds-fresh re-fetch keyed to a CNR**.

### 2. The open-source scraper lineage — and it ships CAPTCHA solvers

The technique these vendors monetize is openly published on GitHub and Apify, and the public
projects **bundle CAPTCHA solvers** (OCR/ONNX), because the portals gate every query behind a
Securimage CAPTCHA:

- **`iamshouvikmitra/bharat-courts`** ([github](https://github.com/iamshouvikmitra/bharat-courts)) —
  async Python SDK, "without using official APIs, since none exist." It reverse-engineers the
  portal: "The eCourts HC Services portal uses a PHP backend with Session cookies, **Securimage
  CAPTCHAs pinned to sessions**, AJAX POST requests, and JSON responses." It ships **three solvers**:
  `OCRCaptchaSolver` (`ddddocr`, "~75% accuracy … failed attempts are automatically retried with
  fresh sessions (default 5 retries — P(all fail) ≈ 0.1%)"), `ONNXCaptchaSolver` ("lightweight
  CAPTCHA solver using ONNX Runtime"), and `ManualCaptchaSolver`. This is a textbook
  scrape-and-defeat-CAPTCHA pipeline — the exact thing CLAUDE.md rule #2 forbids us from building.
- **`codingfrontend/ecourts-case-scraper`** (Apify) ([apify](https://apify.com/codingfrontend/ecourts-case-scraper)) —
  "Playwright with Chromium … **OCR-Powered Captcha Solving: Uses Tesseract.js to automatically
  solve captcha images** … Up to 5 attempts per case with fresh captcha images."
- **`96mohitm/court-data-scraper`** ([github](https://github.com/96mohitm/court-data-scraper)) —
  "uses tesseract for captcha recognition."
- **`openjustice-in/ecourts`** ([github](https://github.com/openjustice-in/ecourts)) — GPL-3.0
  scraper of `hcservices.ecourts.gov.in`, "intentionally single-threaded … to avoid overloading the
  eCourts servers," for "journalists and law researchers." Notably it warns: "**If you run this
  code, you are responsible for the legal implications of the same.**"

The commercial vendors (eCourtsIndia, Vakeel360, Surepass, Kleopatra) are the **hosted, paid,
SLA-wrapped version of exactly this lineage** — same portals, same CAPTCHA gate, same per-CNR
re-fetch — with the CAPTCHA-solving and session-rotation hidden behind a Bearer token and credits.

### 3. Authorization reality — no evidence of any, and the official policy cuts against them

- **No vendor produces an MoU, NJDG license, or partner agreement.** Across their API pages, docs,
  and pricing, the strongest claim is "from official eCourts servers" — which describes the *target*
  of a scrape, not a *grant*. We found **zero** evidence of authorized sourcing.
- The **NJDG Open API exists but is gated to government / institutional litigants** (Part 1 of this
  doc) — not open to a commercial reseller. So "we use NJDG" would not even be available to them.
- **eCourts' own policies cut against resale:** the Copyright Policy states "**The contents on this
  website shall not be reproduced partially or fully, without duly & prominently acknowledging the
  source**," prohibits use "in any misleading or objectionable context," and for third-party
  copyrighted material requires "**Authorization to reproduce such material must be obtained from the
  Courts Concerned**" ([copyright policy](https://services.ecourts.gov.in/ecourtindia_v6/?p=copy_right_policy/index)).
  The Terms disclaim all liability and place disputes under Indian courts' jurisdiction
  ([terms](https://services.ecourts.gov.in/ecourtindia_v6//?p=terms_and_conditions/index)).
  Independently of the bare ToS text, **defeating the CAPTCHA is circumventing an access control**,
  which is the bright line in CLAUDE.md rule #2 and `2026-06-24-court-data-strategy.md`.

Net: these operate in the **scrape-and-resell grey zone**, not under authorization.

### 4. Legal exposure for us as a *consumer* of such an API

If the upstream is unauthorized scraping + CAPTCHA bypass, the taint and risk flow downstream to a
paying consumer:
- **Tainted provenance.** Our whole product promise is "source: eCourts, verify against the official
  record." Data obtained by defeating an access control has provenance we cannot stand behind, and
  re-publishing it can itself implicate the Copyright Policy's reproduction/attribution conditions.
- **CAPTCHA bypass = circumventing access controls.** Under Indian law this is the riskiest facet —
  squarely the conduct rule #2 forbids — and Indian courts analyze scraping primarily through
  **copyright (compiled data as "literary work," Copyright Act 1957 s.2(o))** and **contract (ToS
  breach)**; enforceability of ToS/`robots.txt` against scrapers is **still unsettled in India**,
  which is itself a risk, not a safe harbor ([ikigailaw](https://www.ikigailaw.com/article/263/legality-of-data-scraping-in-india),
  [babariaip](https://babariaip.com/blog/data-scraping-and-related-legal-issues-in-india/)).
- **DPDPA 2023** adds consent/processing obligations once personal data (party names, advocate
  details) is involved, even if "publicly available" ([law.asia](https://law.asia/india-data-scraping-regulation/)).
- **Known takedowns/litigation:** we found **no specific reported judgment against an eCourts-data
  reseller** to date (the space is grey, not yet litigated) — but the general scraping-litigation
  pattern (ToS-breach + copyright-preemption fights, e.g. [Quinn Emanuel](https://www.quinnemanuel.com/the-firm/publications/the-legal-landscape-of-web-scraping/),
  [Skadden](https://www.skadden.com/insights/publications/2024/05/district-court-adopts-broad-view))
  shows the consumer of scraped data is not insulated. Absence of a precedent is not absence of risk.

### Verdict & implication

> **VERDICT:** The evidence — eCourtsIndia's own "forces a **live re-scrape from official eCourts
> servers** (5–30s)" claim, the absence of any MoU/license, and an identical open-source lineage
> (`bharat-courts`, Apify, `openjustice-in`) that ships OCR/ONNX **CAPTCHA solvers** against the
> portals' Securimage gate — points to **(a): on-demand automated scraping of the official eCourts
> portals with programmatic CAPTCHA bypass, resold behind an API**. No authorization exists; they
> operate in the scrape-and-resell grey zone. Peers (Vakeel360/Surepass/Kleopatra) are the same.
>
> **IMPLICATION FOR US:** We will **not** replicate CAPTCHA-bypass scraping (CLAUDE.md rule #2), and
> we would consume such a provider **only if it can contractually prove authorized sourcing** (a real
> NJDG license / eCommittee MoU) — which none demonstrates today. Default stands: **open data
> (AWS CC-BY-4.0 `parquet_case_details`, Indian Kanoon as a paying customer) + human-in-the-loop
> manual entry** for anything the open corpus lacks.

#### Sources
- eCourtsIndia API & docs (marketing copy, pages 403 to bots): https://ecourtsindia.com/api · https://ecourtsindia.com/api/docs · https://ecourtsindia.com/services
- Vakeel360: https://vakeel360.com/api · Surepass: https://surepass.io/ecourts-api/ · Kleopatra: https://court-api.kleopatra.io/ · ECIAPI: https://eciapi.akshit.me/
- OSS scraper lineage w/ CAPTCHA solvers: https://github.com/iamshouvikmitra/bharat-courts · https://apify.com/codingfrontend/ecourts-case-scraper · https://github.com/96mohitm/court-data-scraper · https://github.com/openjustice-in/ecourts
- eCourts official policies: https://services.ecourts.gov.in/ecourtindia_v6/?p=copy_right_policy/index · https://services.ecourts.gov.in/ecourtindia_v6//?p=terms_and_conditions/index
- Indian scraping-law context: https://www.ikigailaw.com/article/263/legality-of-data-scraping-in-india · https://babariaip.com/blog/data-scraping-and-related-legal-issues-in-india/ · https://law.asia/india-data-scraping-regulation/ · https://www.quinnemanuel.com/the-firm/publications/the-legal-landscape-of-web-scraping/ · https://www.skadden.com/insights/publications/2024/05/district-court-adopts-broad-view
