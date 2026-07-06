# WO-54 · Cases workspace — Wave 3 (row/card information depth) + Wave 1 migration proposal

**Date:** 2026-07-06 · **Session:** S-WO54-opus-20260706 · **Repo:** legaldriver · **Status:** W3 shipped; W1 migration **proposed (founder-gated)**.

WO-54 (5 waves) responds to the founder's 2026-07-06 ask to segregate the Cases list by court tier, add
richer per-tier filters, put more information on each row/card, and offer density/view options. This PR
ships **Wave 3** (row information depth + a detail drawer) — the part that is genuinely unblocked — and
**presents the Wave-1 data-model migration** for founder approval (not applied here).

## What shipped (Wave 3 — non-gated)

The Cases list previously showed a flat row (title · CNR · client · court · stage · status · next-hearing ·
source) and a per-row link to the full case page — one disclosure level, and most of what we store in
`matter.detail` was invisible until you navigated away. Wave 3 raises the row to answer, at a glance,
*"when / for what / whose court / which side / can I trust this?"* and adds a peek without leaving the list.

- **Richer row (`cases-table.tsx`).**
  - **Court-scoped case number** under the title (e.g. `SCA/9465/2023`) — composed by the pure
    `courtCaseNo()` from the case-type code + the stored registration/filing number + year. Defensive: no
    number stored → the row keeps the CNR; a number that already carries `/YYYY` isn't doubled; never a
    fabricated number (information-integrity).
  - **Court-tier chip** (HC / District) when `detail.tier` is present — the "whose court" axis the founder
    asked to segment by, surfaced now on the row (a preview of the Wave-2 tier tabs).
  - **Next-hearing urgency chip** (`Today` / `Tomorrow` / `in Nd` / `Nd overdue`) via the pure
    `hearingUrgency()`, diffing whole days off the ISO strings (UTC midnights → no TZ day-roll). `future`
    (>7d) and absent dates render **no** chip — the date speaks for itself; we never invent urgency.
- **Detail drawer (`components/cases/case-detail-drawer.tsx`).** A right-side "peek" (progressive
  disclosure, ≤2 levels: row → drawer → full case page) opened from a per-row **Details** button. It
  renders **from the row data already fetched for the list** (no second query) and surfaces the fuller
  record: parties (petitioner/respondent), court + coram + tier, the full identifier grid
  (registration/filing no + dates, first hearing, district/state, FIR/police station, decided-on), the
  expanded case-type, acts & sections, advocates (with bar ids), and judges — plus provenance (source +
  "updated Nd ago") and the mandatory "verify against the official record" line and a "View full case"
  link. Escape-dismissible, scroll-locked, focus-managed, `role="dialog"`, layered above the bulk bar.
- **Every court value goes through the BP-17/WO-45 court kit** (`CourtField`/`CourtChip`/`CourtDate`/
  `EmptyCell`) → honest empties ("not on record at eCourts" for court-sourced fields, dropped for
  not-sourced ones, "not applicable" for a pending case's decision date — never a bare "—"), day-first
  TZ-correct dates.
- **No new fetch, no migration.** The list query (`cases-query.ts`) now also selects the existing
  `detail` jsonb + `advocate_names`/`act_names`/`judge_names` columns (they already back the facets), so
  the drawer renders off the page's rows. Bounded by pagination — no N+1.
- **Shared, not inlined (product-depth §2b).** The raw `detail → field` mapping is now the pure
  `extractCaseDetailValues()` in `case-detail-fields.ts`, consumed by **both** the full case page and the
  drawer so they can't drift (the page keeps its legacy `fmtDate`; the drawer formats via the court kit).

### Honest scope — deferred, not silently dropped (filed to BACKLOG §D)
- **"Mark our side"** on parties needs the client↔party linkage; not reliably derivable from the row →
  deferred (drawer shows petitioner/respondent honestly).
- **Flag cluster** ships only the signals backed by real data (urgency + tier). *Newly-listed / new-order /
  unread* need a per-view "seen since" signal + BP-07's sweep → deferred to Wave 5.
- **Tier tabs + tier-aware facets (Wave 2)** are ship-grade-blocked by the Wave-1 migration below.
- **Density tiers + view modes + column config (Wave 4)** and **watch/star + freshness + related-cases
  (Wave 5)** remain their own waves.

## Wave 1 — proposed data-model migration (FOUNDER-GATED — not applied)

Tier-first tabs + per-tier facets (Wave 2) must be **bounded + indexed** (ship-grade — the founder's
"built for demo" complaint is the 1000-row facet scan). Today `tier`/`district`/`court establishment`/
`bench` live only in `matter.detail` jsonb, so tier filtering/faceting would be a jsonb full-scan.

**Recommendation: plain, indexed `matter` columns written through a pure normalization layer** — *not*
generated columns and *not* raw jsonb indexes. The deciding fact: `upsertCase`/`legaldriver.ts` stores
`detail.tier` **verbatim from the platform API** (`tier: r.tier`, no normalization — it's even used as a
fallback court-name string), so the raw jsonb value is a dirty, open-ended string, not a clean enum.

### The options, and why plain-columns-with-normalization wins

| Option | Mechanism | Verdict |
|---|---|---|
| **A. Plain indexed columns + normalizer** | `add column` + `upsertCase` writes `normalizeTier(detail)`; backfill; partial indexes | ✅ **Recommended** |
| **B. Generated `STORED` columns** | `add column tier … generated always as (detail->>'tier') stored` | ✗ here |
| **C. Expression / GIN index on jsonb** | `create index on matter ((detail->>'tier'))` / `gin(detail)` | ✗ here |

- **B (generated columns) is the more elegant mechanism *in the abstract*** — the column is always exactly
  `detail->>'tier'`, so there is **zero dual-write drift** (it directly kills the WO-41 "detail updated, the
  mirror didn't" bug class). **It loses here only because the value is un-normalized:** a generated column
  (or a raw expression/GIN index) would surface `HC`, `High Court`, bench names, etc. as **separate
  tabs/facets** — the same fragmentation already logged in `DATA-GAPS` for the advocate facet (`Y J PATEL`
  vs `MR YASH J PATEL` counted apart). And a generated column's expression can't evolve (new state, refined
  mapping) without another full-table rewrite. **If the pre-check below shows the values are already
  clean, flip to B** — it's strictly nicer when normalization isn't needed.
- **C (raw jsonb indexes)** shares B's dirty-value problem and gives clumsier queries + weaker planner
  stats; a GIN index also can't serve the `DISTINCT` facet-option-list query. Rejected.
- **A's one weakness vs B — drift** — is closed cheaply by a **guardrail test asserting
  `column === normalize(detail)`** (same style as `wo54_cases_row_depth`), so we get B's safety without its
  rigidity.

**Pre-check before finalizing (settles A vs B):**
```sql
select distinct detail->>'tier' as tier, count(*) from matter group by 1 order by 2 desc;
```
Clean, small, stable set (`HC`/`DISTRICT`) → use **B** (generated columns). Dirty/varied (expected) → **A**.

### Proposed migration (Option A), via `supabase migration new wo54_matter_court_columns`
```sql
-- Additive, nullable → no RLS change, no rewrite lock (unlike a STORED generated column). Populated by
-- upsertCase going forward + one backfill pass below.
alter table matter add column if not exists tier text;                 -- normalized enum: HC|DISTRICT|TRIBUNAL|SC
alter table matter add column if not exists district text;
alter table matter add column if not exists court_establishment text;
alter table matter add column if not exists bench text;

-- Backfill from the existing jsonb (one pass, no eCourts calls). NB: the app-side normalizeTier()/
-- normalizeCourt() is the source of truth; this SQL is a first-cut and should be superseded by a
-- backfill script that runs the SAME normalizer the app uses (so backfill == live write).
update matter set
  tier                = coalesce(tier,                nullif(detail->>'tier', '')),
  district            = coalesce(district,            nullif(detail->>'district', '')),
  court_establishment = coalesce(court_establishment, nullif(detail->>'subordinate_court', '')),
  bench               = coalesce(bench,               nullif(detail->>'coram', ''))
where detail is not null;

-- Partial indexes for the per-tier faceted list (tenant-scoped by RLS; tier-partitioned).
create index if not exists matter_tier_idx     on matter (tenant_id, tier);
create index if not exists matter_district_idx on matter (tenant_id, district) where tier = 'DISTRICT';
```

- **Normalizer:** a pure `normalizeTier()` (raw → closed enum) + `normalizeCourt()`/`normalizeDistrict()`
  that **consume the BP-05 dictionaries + BP-03 entity-resolution** already normalizing court/establishment
  codes — do **not** hand-roll a second normalizer. `upsertCase` writes the normalized value alongside
  `detail`; a guardrail test asserts `column === normalize(detail)`.
- **Also (ship-grade):** replace the remaining 1000-row facet scan in `cases/page.tsx` with a
  **distinct-values RPC / bounded aggregate** so per-tier facet option lists are indexed, not client-derived.
- **Lock note:** on a large `matter` table, A's nullable-add + batched backfill holds locks for less time
  than B's atomic table rewrite; at pilot scale either is fine.

**Founder decision needed:** approve **A (plain columns + normalizer)** — or **B** if the pre-check shows
already-clean values; confirm default tab (**All** recommended) and tier set (Gujarat = HC + District
today). On approval, Wave 2 opens a fresh branch, adds the real timestamped migration + the normalizer +
its guardrail test, and builds tier tabs + tier-aware facets on top. Tracked in FOUNDER-ACTIONS #16 +
BACKLOG §D.

## Gates
typecheck ✓ · lint ✓ · build ✓ · offline suite **39/39** (new `wo54_cases_row_depth`, 36 checks; pure
urgency/case-no/extractor logic + structural guards that the drawer routes through the court kit, layers
above the bulk bar, opens from the row, and the query surfaces the drawer's fields) · i18n en+hi parity
(1606=1606, `cases.urgency.*` + `cases.drawer.*` added both locales) · `wo41_case_detail_rows` still green
(the extractor refactor is behaviour-preserving for the case page).

**Not click-tested locally** (no demo creds / live Supabase in the sandbox) → routed to BACKLOG §D4
verify-next for the UI-QA tester (render + inspect the drawer at 390/768/1440 in en+hi; confirm the
urgency chip, tier chip, and case-no on real data). The guardrail spec covers the pure logic + the
adoption contract; the QA tester covers the live visual pass (ship-grade §8 / LEARNINGS).
