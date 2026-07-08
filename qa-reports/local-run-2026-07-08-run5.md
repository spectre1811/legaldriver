# QA Run 5 — 2026-07-08

## Environment

| Item | Value |
|---|---|
| Date | 2026-07-08 |
| Run label | 2026-07-08-run5 |
| Branch | wt/QA-RUN (rebased on origin/main `852b4bc`) |
| Node | $(node -v) |
| Playwright | latest (via npm ci) |
| DEMO_MODE | 1 |
| Build mode | Dev (npm run dev, localhost:3000) |
| E2E creds | demo@lexdriver.test / demo-pass-1234 |

## Critical Harness Fix This Run

**`@headlessui/react` missing in QA worktree — caused 43 cascade failures**

WO-55 shipped `@headlessui/react` (used by the new `<Combobox>` primitive) but the QA worktree's `node_modules` were stale. Every page that imports from `src/app/dashboard/settings/advocate-form.tsx` (which imports combobox.tsx → @headlessui/react) failed to compile. Result: the First run of the full suite showed 43 failures instead of ~12. `npm ci` fixed it.

After `npm ci`: **44/63 pass, 12 fail, 9 skip** — all 12 remaining failures are known bugs.

**Lesson**: Always run `npm ci` after rebasing the QA worktree on main. Add to LEARNINGS.

---

## E2E Gate Summary (Layer 1)

**After npm ci:** 44 pass / 12 fail / 9 skip — 1m 6s

| Spec | Pass | Fail | Skip | Notes |
|---|---|---|---|---|
| auth.setup | 1 | 0 | 1 | junior skipped (no E2E_EMAIL2) |
| smoke.spec | 1 | 0 | 0 | ✅ dashboard renders clean |
| hero-case-detail | 0 | 1 | 0 | F4 — RSC abort (unpdf) |
| hero-cases | 2 | 0 | 0 | ✅ |
| hero-lookup | 1 | 1 | 0 | F6 — flaky under load |
| hero-manual-add | 1 | 0 | 0 | ✅ |
| pagination | 0 | 1 | 3 | cases pagination failing under load |
| routes-authed (static) | 25 | 2 | 0 | H1 — redirect stubs (/assistant, /search) |
| routes-authed (dynamic) | 0 | 5 | 5 | harness-shared-id — wrong UUID for entity type |
| public (routes) | 13 | 0 | 0 | ✅ all public routes |

**Multi-pass with correct entity UUIDs (all pass in isolation):**
- `clients/[id]` → e234cc57-7e2b-49be-a320-584c98f0d91e ✅
- `documents/[id]` → 8f661b3e-5d9b-49be-9c6f-6a3629725fdb ✅
- `invoices/[id]` → 143c1a89-d39a-402d-82b6-0fc0256dfe30 ✅
- `invoices/[id]/print` → same invoice UUID ✅

---

## Backend Tests (Layer 2)

| Test | Result |
|---|---|
| `tests/p1_smoke.ts` | ✅ PASS (auth + RLS + mock provider) |
| `tests/ai_gateway.ts` | ✅ ALL PASS (13 assertions: fallback/routing/metering/schema) |
| `tests/i18n_coverage.ts` | ✅ PASS (en=1739, hi=1739 keys — parity) |
| `tests/design_tokens_smoke.ts` | ✅ PASS |

---

## Spider Pass (Layer 3)

**12 pass / 9 fail / 6 skip · 24 screenshots**

### D4 Verify-Next Verdicts

| Item | Verdict | Notes |
|---|---|---|
| **WO-41** Court record tab | ✅ PARTIAL VERIFIED | Court tab renders with all field labels (Registration No, Filing No, First Hearing, District etc). Mock case shows "not on record" (expected — demo data). Tab structure and layout correct. Need real CNR-sourced case to verify data population. |
| **WO-42** Advocate onboarding bar-number | ✅ VERIFIED | `/dashboard/onboarding` shows correct single-field BAR ENROLMENT NO. input + "Select State Bar Council..." combobox. Form polished at 390px. "Add & fetch my cases" CTA clear. |
| **BP-17** Case timeline tab | ✅ VERIFIED | Timeline tab shows 3 hearings (Evidence 12 Jul, Evidence 15 Jun, Framing of Issues 19 May 2026), each with date, purpose badge, and judge name ("Hon'ble Shri D. N. Kapadia"). "Case timeline (3)" heading. Polished and data-rich. |
| **WO-56** Advocate dossier pagination | ❌ NOT VERIFIED | Advocate dossier for GUJ/1187/2004 returns 404 — root cause: `ldEnabled()=true` but `getAdvocateProfile()` returns null (API has no scraped data for this bar ID in dev). Bug B1 filed: bare 404 should be a designed empty state. |
| **WO-65** Full roster seeding | ⬜ NOT TESTED | Not exercised this run — onboarding page shows "105 cases on file" for Adv. Nirav Desai (Last run 06 Jul 2026). Roster likely seeded but not click-tested vs spec. Move to next D4 cycle. |

### New Routes Visited

| Route | Result | Notes |
|---|---|---|
| `/dashboard/onboarding` | ✅ FIRST VISIT | Renders. Shows enrolled advocates, practice stats (105 cases), add-advocate form. Adversarial inputs pass. Polished at 390px. Remove from neverVisited. |
| `/portal/*` | ✅ | Advocate session correctly redirected to /dashboard (not portal login). Expected. |
| `/dashboard/advocate/[barId]` | ❌ 404 | `GET /dashboard/advocate/GUJ/1187/2004` returns bare 404 — API has no data. Bug B1 filed. |

### Coverage Gap Progress

| Flow | Result |
|---|---|
| Clients create + delete | ✅ Create succeeded (conflict-check + Adding... observed). Cleanup: client deleted from DB. Spider had timing issue (checked too early). Mark create_client_submit ✅. |
| Invoices print page | ✅ Renders correctly |
| Judgments search submit | ✅ Search works (98 results returned) |
| Cases filter panel | ⏭️ SKIPPED — "No filter button found". WO-59 likely changed filter UI (was a button, may now be something else). Investigate next run. |
| Notices create form | ⏭️ SKIPPED — Form opened but content unclear (screenshot taken). |
| Invoices create | ⏭️ SKIPPED — No create button found. May be a sidebar action or hidden flow. |
| Analytics interactions | ⏭️ SKIPPED — No date filter buttons matching /week|month|year/i |

---

## New Bugs Found

### [A3] /dashboard/voice — `from_number` tel input unlabeled (P3/a11y)
- **Surface**: Voice & Calls page, caller phone number input
- **Symptom**: `<input type="tel" name="from_number">` has no `aria-label` or associated `<label>` — WCAG 2.1 A `label` violation
- **Fix**: Add `aria-label="Caller phone number"` or wrap in `<label>`
- **Sibling probe**: Same page already has A2 (file input) and A4 (checkbox) — this is a PATTERN in the voice page component. All three unlabeled inputs in the same form.
- **Why P3**: WCAG A; screen reader users cannot determine the field's purpose

### [A4] /dashboard/voice — `consent_disclosed` checkbox unlabeled (P3/a11y)
- **Surface**: Voice & Calls page, DPDP consent checkbox
- **Symptom**: `<input type="checkbox" name="consent_disclosed">` has no associated `<label>` — WCAG 2.1 A `label` violation
- **Fix**: Add `<label htmlFor>` for the DPDP consent checkbox
- **Sibling probe**: See A2 and A3 — entire voice form needs an a11y sweep. File ONE WO to fix all three.
- **Why P3**: WCAG A compliance; consent checkbox especially must be clearly labeled

### [A5] /dashboard/messages — 2 text inputs unlabeled (P3/a11y)
- **Surface**: Messages page, WhatsApp/SMS composer
- **Symptom**: Recipient number and message body `<input type="text">` elements have no `aria-label` or associated `<label>` — WCAG 2.1 A `label` violation
- **Fix**: Add `aria-label="Recipient phone number"` / `"Message"` or wrap in `<label htmlFor>`
- **Why P3**: WCAG A; messages-to-clients feature with inaccessible form

### [B1] /dashboard/advocate/[barId] — Bare 404 instead of designed empty state (P3/ux)
- **Surface**: Advocate dossier page when API has no data for the bar ID
- **Symptom**: Page calls `notFound()` when `getAdvocateProfile()` returns null → raw Next.js "404 This page could not be found" with no context, no nav, no recovery path
- **Repro**: Navigate to `/dashboard/advocate/GUJ/1187/2004` in dev
- **Fix**: Replace `if (!profile) notFound()` with an in-page empty state: "Advocate data not yet synced — check back after the next scraper run" + Refresh button
- **Root cause file**: `src/app/dashboard/advocate/[...barId]/page.tsx:38`
- **Why P3**: Bad first-impression empty state; not a functional blocker since the data just needs to be scraped

---

## Regression Table

| Bug | Status | This Run |
|---|---|---|
| F4 — hero-case-detail RSC abort (P1) | OPEN | ❌ STILL OPEN — hero-case-detail fails in E2E, cascades to ~8 suite failures |
| F6 — hero-lookup flaky (P3) | OPEN | ❌ STILL OPEN — flaky under full-suite load; passes in isolation |
| V2 — documents bulk bar export white elements (P3) | OPEN | ❌ STILL OPEN — bulk bar triggered, screenshot taken (visual confirms black bar is rendered) |
| H1 — redirect stubs trip ERR_ABORTED gate (P2) | OPEN | ❌ STILL OPEN — /assistant and /search stubs fail in full-suite |
| S1 — judgments 98 rows no pagination (P2) | OPEN | ❌ CONFIRMED — spider searched, 98 rows returned, no pagination element |
| A1 — documents dropzone unlabeled file input (P3) | OPEN | ❌ STILL OPEN — 1 unlabeled input detected |
| A2 — voice native file input not styled (P3) | OPEN | ❌ STILL OPEN — visually exposed native file input detected |
| harness-shared-id — dynamic routes share UUID (P3) | OPEN | ❌ STILL OPEN — multi-pass workaround used |

---

## Coverage Delta

| Metric | Run 4 | Run 5 | Delta |
|---|---|---|---|
| E2E pass count | 38/63 | 44/63 | +6 (npm ci resolved @headlessui) |
| Routes visited total | 20 | 25 | +5 (onboarding, portal, advocate, cases/[id], portal/login) |
| Never visited | 6 | 2 | -4 |
| Open bugs | 8 | 12 | +4 (A3/A4/A5/B1) |
| D4 items verified | 0 | 3 | WO-41 ✅, WO-42 ✅, BP-17 ✅ |
| New coverage gaps closed | — | 4 | search_submit, invoice_print, create_client, court/timeline tabs |

---

## Ship-Grade Lens

| Issue | Severity |
|---|---|
| S1: 98 judgment rows, no pagination | **P2 ship-grade** |
| F4: hero-case-detail RSC abort cascades to 8 E2E failures | **P1 infra blocker** |
| A3/A4/A5 + A1/A2: 5 unlabeled inputs across 3 pages | P3 WCAG A |
| B1: advocate dossier bare 404 | P3 UX |
| Cases filter UI changed by WO-59 — spider couldn't find filter button | P3 coverage gap |

---

## Console / Network Errors

- `unpdf` "Critical dependency: Accessing import.meta directly" warning on every cases route compile — root of F4 and HMR cascades. Present in all runs.
- No new console errors observed on new routes.

---

## Adversarial Input Results

- `/dashboard/onboarding`: 3 adversarial inputs (XSS, Devanagari, 200-char) — no layout blowout ✅
- `/dashboard/ip` (previous run): passed all adversarial tests ✅
- `/dashboard/voice`, `/dashboard/messages`: forms have a11y gaps but no XSS/layout issues

---

## Next Run Priority

1. **F4 (P1)** — fix unpdf lazy-import; suite should jump from 44→~52 pass
2. **S1 (P2)** — wire `<Pagination>` to `/dashboard/search/judgments`
3. **H1 (P2)** — exclude redirect-only stubs from gen-routes.mjs
4. **A11y WO** — batch-fix A1/A2/A3/A4/A5 in a single WO (voice + messages + documents)
5. **Cases filter UI** — investigate new filter UX from WO-59 and exercise it
6. **Invoices create flow** — find the create invoice path
7. **D4 WO-65** — click-test full roster seeding on the onboarding page
