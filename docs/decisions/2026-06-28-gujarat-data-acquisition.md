# Gujarat court-data acquisition plan (ranked, compliant)

Date: 2026-06-28
Status: research → decision input
Scope: concrete, large-scale, COMPLIANT sources of **Gujarat (India)** court data for the
LexDriver datastore. Gujarat-focused; notes all-India where the same source serves us.

This complements (does not replace) `2026-06-25-court-data-sourcing.md` (all-India sourcing)
and `2026-06-24-court-data-strategy.md` (the hard line). Read those for the live case-status /
cause-list gap; this doc is specifically the **ranked bulk-acquisition plan with Gujarat
volumes verified against the live sources on 2026-06-28**.

## Hard constraints (these bound every recommendation below)

- **No CAPTCHA solving or bypass.** No tool/model/service that defeats the eCourts arithmetic
  or image CAPTCHA, directly or via a third party.
- **No scraping that circumvents access controls** on `services.ecourts.gov.in`,
  `hcservices.ecourts.gov.in`, `gujarathc-casestatus.nic.in`, or the eCourts mobile app.
  No unauthorized automated access to eCourts systems.
- **Respect robots.txt + ToS of every site.** Recommend only what they permit. Anything that
  needs circumvention is marked **OUT OF SCOPE** with the reason.

### Robots/ToS checked live on 2026-06-28
- `www.data.gov.in/robots.txt` → `User-agent: * / Disallow: /` — **do NOT crawl the site;**
  use the official OGD REST API (api.data.gov.in) or the human download button instead.
- `gujarathighcourt.nic.in/robots.txt` → returns **403** (no published robots policy we may
  rely on). The site disclaimer is general ("information only, not advice; original record is
  binding") and is silent on reuse/automated access — silence is **not** permission. Treat the
  HC site's interactive, CAPTCHA-gated query pages as off-limits to automation.
- `judgments.ecourts.gov.in/robots.txt` and `njdg.ecourts.gov.in/robots.txt` → **404** (no
  robots file). The portals are CAPTCHA-gated on search; we consume bulk **mirrors**, never the
  query UIs (see ranked list).

---

## Ranked acquisition plan

### #1 — AWS Open Data: "Indian High Court Judgments" (the biggest legitimate bulk win)
- **Contains:** Full-text **judgment/order PDFs** of 25 High Courts + raw metadata (JSON) +
  structured metadata (**Parquet**: `court_code, title, description, judge, pdf_link, cnr,
  date_of_registration, decision_date, disposal_nature, court_name`, partitioned by year/court/bench).
- **Gujarat coverage (verified in the bucket 2026-06-28):** Gujarat HC = partition
  `court=24_17`, `bench=gujarathc`. PDF counts per year in `data/pdf/year=YYYY/court=24_17/`:
  2015 ≈ 9.0k, 2018 ≈ 45.6k, 2019 ≈ 61.9k, 2020 ≈ 40.9k, 2021 ≈ 53.4k, 2022 ≈ 68.5k,
  2023 ≈ 4.5k, 2024 ≈ 1.8k, 2025 ≈ 7.5k (recent years still backfilling). **≈ 290k+ Gujarat
  HC judgment PDFs already available**, updated daily.
- **License:** **CC-BY-4.0** (attribution). Public-record judgments re-published openly.
- **Format:** PDF + JSON + Parquet; tar archives for bulk.
- **Approx volume:** ~17.8M judgments total, ~1.25 TiB; Gujarat slice is a few hundred GB.
- **Exact access (no AWS account, no auth, no CAPTCHA):**
  - `aws s3 ls --no-sign-request s3://indian-high-court-judgments/`
  - Gujarat metadata: `s3://indian-high-court-judgments/metadata/parquet/year=2024/court=24_17/bench=gujarathc/`
  - Gujarat PDFs: `s3://indian-high-court-judgments/data/pdf/year=2024/court=24_17/`
  - Registry page: https://registry.opendata.aws/indian-high-court-judgments/
- **Compliance note:** We consume the **published CC-BY artifact on AWS** (a sanctioned Open
  Data Registry dataset). We do **NOT** run the upstream scraper — its collector uses an ONNX
  CAPTCHA solver against eCourts, which is squarely **OUT OF SCOPE** for us. Attribute the
  source; keep our court-data provenance/disclaimer fields. (Residual risk: the corpus's own
  provenance involved CAPTCHA bypass upstream; we rely on its open re-licensing of public
  records and consume only the static mirror. Flag for legal sign-off before production.)
- **Effort to ingest:** **Low-medium.** `aws s3 cp/sync` of the `court=24_17` partition →
  Supabase Storage; load Parquet metadata into Postgres; parse PDFs with our existing classifier
  pipeline. Filter strictly to Gujarat partitions.

### #2 — AWS Open Data: "Indian Supreme Court Judgments" (e-SCR, all-India incl. Gujarat appeals)
- **Contains:** SC judgments 1950–present (English + regional languages) + JSON/Parquet metadata.
- **Gujarat relevance:** SC matters arising from Gujarat; not Gujarat-specific but core reference.
- **License:** **CC-BY-4.0.** **Format:** PDF/JSON/Parquet + tar. **Volume:** e-SCR ≈ 34k
  reported judgments (plus broader orders); modest size.
- **Exact access:** https://registry.opendata.aws/indian-supreme-court-judgments/ ·
  `s3://indian-supreme-court-judgments/` (`--no-sign-request`). Repo: github.com/vanga/indian-supreme-court-judgments
- **Compliance note:** Same model as #1 — consume the CC-BY S3 mirror, never the CAPTCHA-gated
  e-SCR/judgments portal UI.
- **Effort:** **Low.** Small corpus; same loader as #1.

### #3 — Development Data Lab "Justice"/eCourts dataset (district & subordinate courts bulk)
- **Contains:** Structured records for India's **lower judiciary** (all District & Sessions
  courts and below — this is where Gujarat's district courts, the bulk of an advocate's
  matters, live). Fields: filing/registration/hearing/decision dates, petitioner & respondent
  names, presiding-judge position, acts & sections, final disposition; separate **judge-level**
  table (name, designation, appointment start/end); inferred gender. Anonymized.
- **Gujarat coverage:** Included as part of the all-India lower-court corpus (no separate
  Gujarat headline figure published; filter by state/district in the data).
- **Year range:** cases filed **2010–2018**. **Volume:** **81.2M cases** (~10M criminal).
- **License:** **Open Database License (ODbL)** + Database Contents License.
- **Format:** bulk download (Dropbox) + metadata sheets (acts-sections, cases, judges).
- **Exact access:** https://www.devdatalab.org/judicial-data (download table on page).
  Restricted fields (religion classification, eCourts identifiers) → email info@devdatalab.org.
- **Compliance note:** Academic, openly licensed (ODbL → must keep open + attribute share-alike
  for derived DBs — check ODbL share-alike implications for a commercial product before shipping
  derivatives). No CAPTCHA, no scraping by us.
- **Effort:** **Medium.** Big files; needs ETL + Gujarat/district filtering + entity resolution
  against our CNR-keyed cases. Static (ends 2018) → good for **historical backfill**, not live.

### #4 — NJDG aggregate datasets via data.gov.in OGD API (pendency/disposal stats)
- **Contains:** Court-wise / state-wise / district-wise **pendency, institution, disposal**
  counts (aggregate statistics, not per-case). Gujarat broken out at state + district level.
- **Gujarat coverage:** Yes — state and per-district figures.
- **License:** Government Open Data (data.gov.in NDSAP terms; free reuse with attribution).
- **Format:** CSV / JSON / XML via API. **Volume:** small (aggregate tables).
- **Exact access:** OGD API at `api.data.gov.in/resource/<resource-id>?api-key=KEY&format=json`
  — register for a free API key (data.gov.in → My Account → Generate Key). Example resource:
  "Court-wise Number of Pending Cases … (NJDG)" at
  https://www.data.gov.in/resource/court-wise-number-pending-cases-across-country-national-judicial-data-grid-njdg-portal-06
  Dataset hub: https://www.data.gov.in/keywords/NJDG
- **Compliance note:** Use the **API** (or the manual download button), **not** site crawling
  (`robots.txt` disallows `/`). API key required (free). NJDG also has a separate *Open API*
  restricted to government entities — not available to a private SaaS.
- **Effort:** **Low.** Few API pulls; good for dashboard/analytics, deadline-context, not case tracking.

### #5 — India Code (bare acts / statutes for deadline + section reference)
- **Contains:** All Central + State (incl. **Gujarat**) Acts, rules, notifications; full text,
  searchable; includes BNS/BNSS/BSA 2023.
- **Gujarat coverage:** Gujarat State Acts present alongside central acts.
- **License:** Government public legislative repository (free reuse; statutes not copyrightable).
- **Format:** HTML pages / DSpace handles; PDFs per act. **Volume:** thousands of acts.
- **Exact access:** https://www.indiacode.nic.in/ (browse by act-year/state; DSpace handles).
- **Compliance note:** Public statute repository; no CAPTCHA. No published bulk dump/official
  API — retrieval is per-act page fetch. Do it politely + cache; this is reference data, low volume.
- **Effort:** **Low-medium.** One-time pull of the acts we cite for jurisdiction-aware deadlines.

### Honorable mention — Internet Archive mirror of Gujarat HC judgments
- Individual Gujarat HC judgment PDFs are also mirrored on archive.org (e.g.
  `archive.org/details/india.highcourt.judgement.gjhc...`). Public-domain-style hosting, free
  to fetch. Lower priority than the AWS bucket (which is structured + has metadata), but a
  useful fallback/cross-check for specific documents. **Effort: low.**

---

## OUT OF SCOPE (no compliant automatable path — do not build)
- **Gujarat HC cause list** (`gujarathighcourt.nic.in/causelist`) — query-by-advocate-code,
  **CAPTCHA-protected**, generated on demand. No bulk/archive download. Automating it requires
  CAPTCHA defeat → forbidden. **Path: human-in-the-loop** (the advocate fetches their own list
  on the portal; we let them upload/forward it). Same for Display Board / Daily Notices.
- **Gujarat case status / orders / neutral-citation search** (`gujarathc-casestatus.nic.in`,
  `hcservices.ecourts.gov.in?state_cd=17`) — CAPTCHA-gated, ToS prohibit automated access.
  **Live case-status remains the unsolved core gap** (see C1 in the all-India doc): HITL refresh,
  or a **licensed paid API** (eCourtsIndia / Kleopatra-style) consumed as a vendor fallback —
  we consume their service, we do not replicate their CAPTCHA-handling method.
- **Running the `vanga/indian-high-court-judgments` scraper ourselves** — it ships an ONNX
  CAPTCHA solver against eCourts. Forbidden. We only consume its **AWS CC-BY output**.
- **Third-party "eCourts API" resellers** (Surepass, eciapi, Apify scrapers) for *collection* —
  most defeat the CAPTCHA upstream. Only a properly **licensed** provider, consumed as a service, is acceptable.

## Official open-data programme a SaaS could apply to
- **eCourts Phase III** explicitly envisages an "open and interoperable data ecosystem" for
  litigants, technologists, and professionals (eCommittee, Supreme Court of India). There is
  **no public bulk-data MoU/API for private SaaS today**; NJDG's Open API is gov-only. **Action:
  monitor + formally request access** from the eCommittee / Dept of Justice — this is the
  sanctioned long-term channel for live data. Track: ecommitteesci.gov.in, doj.gov.in.

---

## Summary (~12 lines)
1. The single **biggest legitimate bulk win is the AWS Open Data "Indian High Court Judgments"
   bucket** (`s3://indian-high-court-judgments/`, **CC-BY-4.0**): **≈290k+ Gujarat HC judgment
   PDFs** under `court=24_17/bench=gujarathc`, with Parquet metadata, daily-updated, no auth/CAPTCHA.
2. Pair it with the **SC judgments** AWS bucket (CC-BY-4.0) for appellate reference.
3. For **district/subordinate** Gujarat history, **DevDataLab** (ODbL, 81.2M lower-court records
   2010–2018) is the big structured backfill — static, needs ETL + share-alike review.
4. For **aggregate pendency/disposal stats**, pull **NJDG via the data.gov.in OGD API** (free key).
5. For **statutes/deadlines**, pull **India Code** (Gujarat + central acts).
6. **Honest gap:** there is **NO compliant, automatable path to live Gujarat case-status,
   orders, or the advocate cause list.** All official query surfaces are CAPTCHA-gated; the only
   lawful options are **human-in-the-loop refresh** or a **licensed paid court-data API** consumed
   as a vendor (never replicating its CAPTCHA method, never crawling data.gov.in).
7. Consume **published mirrors**, never the scrapers that built them.

### Top 3 next actions
1. **Ingest Gujarat HC corpus from AWS:** `aws s3 sync --no-sign-request` the `court=24_17`
   PDF + Parquet partitions → Supabase Storage/Postgres; run our classifier; attach
   CC-BY attribution + provenance/disclaimer fields. (Get legal sign-off on the CC-BY-reliance
   note first.)
2. **Stand up the NJDG/OGD pull:** register a free data.gov.in API key, ingest Gujarat
   pendency/disposal for the dashboard.
3. **Open the official channel:** draft a data-access request to the eCommittee / Dept of Justice
   under the eCourts Phase III open-data vision, and keep HITL refresh as the interim live-data path.

## Sources
- AWS Indian High Court Judgments: https://registry.opendata.aws/indian-high-court-judgments/ · repo https://github.com/vanga/indian-high-court-judgments
- AWS Indian Supreme Court Judgments (e-SCR): https://registry.opendata.aws/indian-supreme-court-judgments/
- Development Data Lab judicial data: https://www.devdatalab.org/judicial-data
- NJDG: https://njdg.ecourts.gov.in/ · DoJ: https://www.doj.gov.in/the-national-judicial-data-grid-njdg
- data.gov.in OGD API: https://www.data.gov.in/apis · NJDG datasets: https://www.data.gov.in/keywords/NJDG
- India Code: https://www.indiacode.nic.in/
- Gujarat HC: https://gujarathighcourt.nic.in/ (disclaimer, causelist) · case search https://gujarathc-casestatus.nic.in/gujarathc/
- eCommittee (Phase III open-data vision): https://ecommitteesci.gov.in/project/brief-overview-of-e-courts-project/
