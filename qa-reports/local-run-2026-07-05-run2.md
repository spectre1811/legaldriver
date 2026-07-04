# QA Local Run — 2026-07-05 (Run 2)

## Environment

| Item | Value |
|---|---|
| Node | v26.4.0 |
| Playwright | 1.61.1 |
| @playwright/test | 1.61.1 |
| DEMO_MODE | 1 |
| E2E_EMAIL | demo@lexdriver.test |
| E2E_PASSWORD | demo-pass-1234 |
| E2E_ROUTE_IDS | `{"id":"f2de04e7-5967-4f11-b49d-206cef5b69f9"}` (matter UUID — seeds cases/[id]) |
| Supabase URL | https://johvrsvaspivmxqvpxcg.supabase.co |
| Commit SHA | 9167810 (origin/main — includes WO-31, WO-39, WO-29) |
| Branch | wt/QA-RUN (rebased on origin/main 2026-07-05) |
| Worktree | ~/personal/legaldriver-QA-RUN |
| App mode | `npm run dev` (dev server; auto-started by webServer config) |
| Axe a11y | Runs on every authed route; threshold = critical (WCAG 2.0/2.1 A+AA) |
| Vision pass | Playwright standalone script; `~/personal/legaldriver-QA-RUN/qa-visual-sweep.mjs` |
| Screenshots | `/tmp/qa-visual-2026-07-05/*.png` |

### Setup notes

1. **Branch rebase**: Prior QA-RUN commit (197448b) was already in origin/main via automerge. Rebased wt/QA-RUN on top of origin/main (9167810) to pick up WO-31, WO-39, WO-29, WO-32 changes.
2. **New since last run**: WO-31 (onboarding promoted to nav), WO-39 W1–W3 (keyset pagination — clients/notices/voice/messages), WO-29 W1b/W3 (Gmail inbox rework), WO-32 (Filing Clerk review inbox).
3. **Live data seeded**: matter=f2de04e7, client=e234cc57, document=8f661b3e, invoice=143c1a89. Used matter UUID for E2E_ROUTE_IDS — seeds cases/[id] correctly; other dynamic routes (clients/[id], documents/[id], etc.) received the wrong UUID type (known harness limitation).
4. **Vision pass**: Ran standalone Playwright script after E2E suite, against same dev server (port 3000). Visited every dashboard route in default + key interaction states (row-selected, modal-open) at 1440px and 390px.
5. **tsx tests**: p1_smoke, ai_gateway, i18n_coverage, design_tokens_smoke — all pass.
6. **i18n growth**: en/hi keys grew 1484 → 1517 (33 new keys for WO-29/WO-31/WO-32/WO-39 features).

---

## Summary

| Category | Count | vs Run 1 |
|---|---|---|
| **Total tests** | 57 | — |
| **Passed** | 30 | ↓ from 36 |
| **Failed** | 18 | ↑ from 6 |
| **Skipped (expected)** | 9 | ↓ from 15 (7 dynamic routes now seeded) |
| **Run time** | ~56.8s | — |

**Skipped breakdown:**
- 1 dynamic route skipped (advocate/judge — no judgeId/barId seeded)
- 6 visual specs: require `RUN_VISUAL=1` + Linux-generated baselines
- 1 junior auth: `E2E_EMAIL2` not set
- 1 misc auth setup (junior)

**Root cause of regression (30→18 pass):** The P3-infra SSR `useContext` bug (previously only hitting /cases + /ai-usage) has escalated. It now triggers webpack HMR full reloads on ~6 additional routes (clients, cause-list, inbox, invoices, settings, documents/review), producing a browser-side `pageerror: Cannot read properties of undefined (reading 'call')` that trips the test gate. Pages VISUALLY render correctly in the browser; the errors are in the JS module system during the HMR reload cycle. Separate from this: 5 dynamic routes now run but fail because they received the matter UUID (wrong type for non-cases routes — expected given the shared `[id]` key limitation).

---

## Per-Failure Detail

### N1 (NEW) — SSR `useContext` regression: 6 static routes newly fail gate

**Specs**: `routes-authed.spec.ts` — renders clean: /dashboard/clients, /dashboard/cause-list, /dashboard/inbox, /dashboard/invoices, /dashboard/settings, /dashboard/documents/review
**Severity**: high · **Type**: regression/infra
**Error**:
```
console errors on /dashboard/settings:
pageerror: Cannot read properties of undefined (reading 'call')
```

**What happened**: The P3 infra bug (`useContext` null in `ErrorBoundary` → `usePathname()` during SSR) was documented in Run 1 as recoverable noise. With WO-29/WO-32/WO-39 merged, these routes now have more Suspense boundaries and server-action patterns that more frequently trigger the SSR error path. When Next.js dev-server catches an SSR error, it broadcasts a Fast Refresh full reload to the browser. During that reload, a webpack module factory calls `.call()` on an undefined value (module registry inconsistency during HMR), producing the pageerror. The pages RENDER correctly; the error is in the HMR layer.

**Newly affected routes (static)**:
- `/dashboard/clients` — WO-39 added `clients/loading.tsx` (new Suspense boundary)
- `/dashboard/cause-list` — `usePathname` SSR path now triggering more
- `/dashboard/inbox` — WO-29 rework; review-inbox imports more client components
- `/dashboard/invoices` — SSR timer path triggering
- `/dashboard/settings` — WO-30 settings-tabs client component
- `/dashboard/documents/review` — WO-32 new route, Filing Clerk W1

**Root cause**: SSR `usePathname()` in `ErrorBoundary` + new Suspense patterns → Fast Refresh full reload → `undefined.call()`. Fix: add `"use client"` to `src/app/dashboard/error.tsx` (removes `usePathname()` from SSR context) — the same fix proposed in Run 1.

**Screenshots**: All 6 routes visually render correctly in the vision pass (see `/tmp/qa-visual-2026-07-05/*`).

**Suspected files**: `src/app/dashboard/error.tsx` (primary fix — `usePathname()` in SSR), `next/dist/compiled/next-server/app-page.runtime.dev.js` (Next.js internal, version-specific behavior).

---

### F1 (STILL OPEN) — `/dashboard/cases`: 24 icon-only buttons missing `aria-label`

**Spec**: `routes-authed.spec.ts › authed route gate › renders clean: /dashboard/cases`
**Severity**: high · **Type**: a11y
**Change from Run 1**: 16 → 24 nodes (more demo cases loaded, each with 2 action buttons).

**What broke**: Cases table now renders 12 rows in the demo tenant (more data since Run 1). Per-row action buttons (delete/archive) contain only SVG with no `aria-label`. Axe reports 24 critical `button-name` violations.

**Repro**:
```bash
DEMO_MODE=1 E2E_EMAIL=demo@lexdriver.test E2E_PASSWORD=demo-pass-1234 \
  npx playwright test "routes-authed.spec.ts" --grep "cases"
```

**Screenshot (vision pass)**: `/tmp/qa-visual-2026-07-05/cases_row_hover.png` — red icon buttons visible on hover with no accessible label.
**Suspected files**: `src/app/dashboard/cases/page.tsx` (row action buttons).
**Fix**: Add `aria-label="Delete case"` etc. to each icon-only button.

---

### F2 (STILL OPEN) — `/dashboard/draft`: Unlabeled file input

**Spec**: `routes-authed.spec.ts › authed route gate › renders clean: /dashboard/draft`
**Severity**: medium · **Type**: a11y
**Status**: Confirmed via vision pass: 1 file input missing label.
**Suspected files**: `src/app/dashboard/draft/` file upload component.

---

### F3 (STILL OPEN) — `/dashboard/research`: Duplicate React key + duplicate rows

**Spec**: `routes-authed.spec.ts › authed route gate › renders clean: /dashboard/research`
**Severity**: medium · **Type**: bug
**Status**: Confirmed via vision pass (F3 duplicate key warning: true). Console error still present.

---

### F4 (STILL OPEN) — `hero-case-detail`: Navigation to case detail too slow (>7.5s)

**Spec**: `hero-case-detail.spec.ts › open a seeded case → detail renders clean with its record + refresh`
**Severity**: medium · **Type**: perf
**Status**: Still failing. Seeded matter UUID loads the correct case ("State v. Kiran Patel") — confirmed by vision pass screenshot showing full case detail. The issue is in dev-mode navigation latency, not data loading.
**Screenshot (vision pass)**: `/tmp/qa-visual-2026-07-05/case_detail_w1440.png` — page renders correctly once loaded.

---

### F5 (STILL OPEN) — `hero-manual-add`: No redirect after manual case creation

**Spec**: `hero-manual-add.spec.ts › create a manual case, land on its page, then delete it`
**Severity**: high · **Type**: bug
**Status**: Still failing. `createManualMatter` action still lacks redirect.
**Suspected files**: `src/app/dashboard/cases/actions.ts:294`.

---

### F6 (STILL OPEN) — `hero-lookup`: Flaky under full-suite load

**Spec**: `hero-lookup.spec.ts › a name search submits and the results page renders clean`
**Severity**: low · **Type**: flaky
**Status**: Still failing in full-suite run (concurrent dev server load). Passes in isolation.

---

### Dynamic route failures (shared `[id]` key limitation — expected)

**Affected specs**: clients/[id], documents/[id], draft/[id], invoices/[id], invoices/[id]/print (5 routes)
**Error**: `expected a <main> landmark` — 404 page (matter UUID is not a valid client/document/draft/invoice UUID).
**This is expected** given the shared `[id]` key limitation. Fix: run multi-pass with per-type UUIDs, or rename params (proposed as harness WO).

**NOTE**: cases/[id] DID seed correctly (matter UUID = matter page) but still fails due to the N1 SSR/HMR pageerror on the dev server.

---

## D4 — Verify-next Queue Results

### WO-27 W3 · Document inline preview + single-zip export (`/dashboard/documents`, `/dashboard/documents/[id]`)

| Step | Result | Notes |
|---|---|---|
| 1. `/documents/[id]` — preview panel renders actual file | ❌ BROKEN | Preview section shows `{"error":"not found"}` raw JSON instead of PDF iframe or graceful fallback. The iframe exists in DOM (count=1) but its src returns an error. Root cause: demo document records exist in DB but the actual PDF bytes are not in Supabase Storage (or the signed-URL endpoint returns 404). |
| 2. Document list — eye button opens quick-look modal | ✅ PARTIAL | Modal opens, has `role=dialog`, header shows filename + "Open full document" link. Content area is blank (iframe loaded but PDF not rendering — same root cause as Step 1). Esc closes modal (confirmed). Eye button found via vision pass. |
| 3. Select 2+ docs → bulk bar → "Export (.zip)" button | ✅ PRESENT | Export button found in bulk bar (count=1). Actual download NOT verified (no Playwright download handler in vision script). |
| 4. index.csv formula injection + truncation note | ⬜ NOT TESTED | Requires actual zip download + unzip assert. Not done this run. |
| 5. a11y: eye button + Export have accessible names; quick-look has role=dialog | ✅ / ✅ | role=dialog confirmed. Export and eye buttons found (accessible enough to locate by Playwright). |

**Overall D4 verdict**: ❌ **BROKEN/PARTIAL** — 2 bugs filed (see §D3 N2, N3 below).

**Key positive finding**: V1 (documents bulk-bar white-on-white selects + auto-widen blowout) is **FIXED** by WO-27 W2. The new bulk bar uses a clean dark pill with "N selected | Export (.zip) | Delete" — no native `<select>` controls, no overflow. The V1 class of bug is gone from the documents surface.

---

## Vision Pass: Additional Findings

### V2 (NEW) — Documents bulk bar: white element on mobile (390px)
**Surface**: `/dashboard/documents` · **State**: row selected (bulk bar active) · **Width**: 390px
**What**: At 390px with rows selected, the bulk bar shows "5 selected | Export (.zip) | [white rectangle]". The white rectangle (an inner bar/progress-like element) is visible against the dark bulk bar background — it appears to be an unstyled or explicitly-white `div` inside the export button.
**Screenshot**: `/tmp/qa-visual-2026-07-05/documents_row_selected_390.png`
**Severity**: low · **Type**: ux/visual
**Suspected files**: `src/app/dashboard/documents/documents-browser.tsx` — the bulk bar's export button/progress indicator area.

### Advocate Onboarding (WO-31) — VERIFIED ✅
Navigation now shows "Advocate Onboarding" as the first item in the PRACTICE section (above Overview). The onboarding page renders correctly: advocate list, "Run onboarding" buttons, "Add advocate" form. Clean, functional.
**Screenshot**: `/tmp/qa-visual-2026-07-05/onboarding_w1440.png`

### Clients list (WO-39 keyset pagination) — VERIFIED ✅
- 8 clients shown with correct case counts
- Footer: "All 8 shown" — honest cap label when all rows fit on one page
- No "Load more" needed (8 < page limit of 30)
**Screenshot**: `/tmp/qa-visual-2026-07-05/clients_w1440.png`

### Settings (WO-30) — VISUAL PASS ✅ (but fails E2E gate due to N1)
- Sectioned left nav: Profile, Practice, Billing, Integrations, Team, Preferences, Data & privacy, Admin & diagnostics
- Profile form shows real demo data (Adv. Nirav Desai)
- Page RENDERS correctly; E2E gate failure is the N1 HMR pageerror (not a visual bug)
**Screenshot**: `/tmp/qa-visual-2026-07-05/settings_w1440.png`

### Inbox (WO-29) — VISUAL PASS ✅ (but fails E2E gate due to N1)
- Clean empty state: "Nothing filed yet · Connect Gmail or run the demo ingest above"
- Privacy footer: "gmail.readonly · refresh token stored encrypted in Supabase Vault · email bodies are never logged." ✅
- "Demo ingest" button present for demo flow ✅
**Screenshot**: `/tmp/qa-visual-2026-07-05/inbox_w1440.png`

### Document detail — raw JSON error in preview (D4 step 1 failure)
**Screenshot**: `/tmp/qa-visual-2026-07-05/document_detail_w1440.png`
- Preview section shows: `{"error":"not found"}` in a code block (not a graceful fallback)
- "Extracted text" section shows real content ✅
- Source provenance shown: "Source Upload · added 3/7/2026, 4:56:32 pm" ✅
- Navigation "Back to Documents" and "Download" button present ✅
- The raw JSON error is the only broken element on this otherwise well-designed page

---

## Console Errors / Server Warnings

1. **`unpdf` Critical dependency** (unchanged from Run 1 — still present on every cases route request). Tied to F4.

2. **`usePathname()` in SSR ErrorBoundary** (escalated from P3 to P1): Now fires on 6+ routes (clients, cause-list, inbox, invoices, settings, documents/review) in addition to /cases. Pages still render correctly but the SSR error triggers:
   - Fast Refresh full reload in browser
   - `pageerror: Cannot read properties of undefined (reading 'call')` in browser

3. **New: `LinkComponent → useContext` Internal Error**: On some routes (clients, cause-list, invoices), the webserver logs `TypeError: Cannot read properties of null (reading 'useContext') at LinkComponent` — a more severe variant. Same root chain: component renders `<Link>` during a timer-based SSR retry, React context is null. Digest: "2225847639".

4. **Fast Refresh full reload warnings**: Multiple per-run (`⚠ Fast Refresh had to perform a full reload due to a runtime error.`). Directly caused by the SSR errors above.

---

## Axe (A11y) Violations

| Route | Rule | Nodes | Impact |
|---|---|---|---|
| `/dashboard/cases` | `button-name` — Buttons must have discernible text | 24 (↑ from 16) | critical |
| `/dashboard/draft` | `label` — Form elements must have labels | 1 | critical |

(Vision pass also confirmed: icon buttons on cases have no aria-label; file input on draft has no label.)

---

## Ship-Grade Lens

| Surface | Finding | Status |
|---|---|---|
| `/dashboard/clients` | 8 rows; footer says "All 8 shown" — honest, no unbounded fetch | ✅ Fixed by WO-39 |
| `/dashboard/cases` | Still no pagination controls visible (22 rows now). WO-39 scope TBD for cases. | Open |
| `/dashboard/research` | No pagination; full corpus result set. | Open |
| `/dashboard/voice` | 0 rows in demo (skeleton or empty state — not observed further) | N/A |
| `/dashboard/messages` | 0 rows in demo | N/A |
| `/dashboard/notices` | 0 rows in demo; "All 0 shown" not visible (empty state) | N/A |

---

## tsx Test Suite Results

| Test | Run 1 | Run 2 |
|---|---|---|
| `tests/ai_gateway.ts` | ✓ PASS (24/24) | ✓ PASS (24/24) |
| `tests/design_tokens_smoke.ts` | ✓ PASS | ✓ PASS |
| `tests/i18n_coverage.ts` | ✓ PASS (1484 keys) | ✓ PASS (1517 keys, +33) |
| `tests/p1_smoke.ts` | ✓ PASS | ✓ PASS |

---

## Regression Table

| Bug ID | Surface | Run 1 Status | Run 2 Status | Notes |
|---|---|---|---|---|
| V1 | /documents bulk bar white-on-white selects + overflow | OPEN | ✅ **FIXED** | WO-27 W2 replaced native selects with clean pill bar |
| F1 | /cases icon buttons no aria-label | OPEN | STILL OPEN | Count increased 16→24 (more demo rows) |
| F2 | /draft file input unlabeled | OPEN | STILL OPEN | Confirmed by vision pass |
| F3 | /research duplicate React key | OPEN | STILL OPEN | Confirmed by vision pass console check |
| F4 | case-detail nav >7.5s dev | OPEN | STILL OPEN | Page loads eventually; dev-mode perf issue |
| F5 | createManualMatter no redirect | OPEN | STILL OPEN | hero-manual-add spec still fails |
| F6 | hero-lookup flaky under load | OPEN | STILL OPEN | Still flaky in full-suite run |
| infra SSR useContext P3 | SSR useContext/usePathname in ErrorBoundary | OPEN (P3) | **ESCALATED P1** | Now blocking 6+ routes; triggers HMR pageerror in browser |
| harness shared [id] key | one id for all dynamic routes | OPEN | STILL OPEN | 5 dynamic routes fail with wrong UUID type |

---

## New Bugs (filed to §D3)

| ID | Route | Severity | Type | Description |
|---|---|---|---|---|
| N1 | 6 static routes | high/P1 | regression | SSR useContext escalated → HMR pageerror on clients, cause-list, inbox, invoices, settings, documents/review |
| N2 | /documents/[id] | medium/P2 | bug | Preview section shows raw JSON `{"error":"not found"}` instead of PDF or graceful fallback |
| N3 | /documents (quick-look modal) | medium/P2 | bug | Preview modal opens but content is blank — PDF not loading (same root as N2: files not in Supabase Storage) |
| V2 | /documents 390px bulk bar | low/P3 | ux/visual | White element visible in export button area at 390px against dark bulk bar |

---

## HTML Report

Location: `~/personal/legaldriver-QA-RUN/playwright-report/index.html`

```bash
cd ~/personal/legaldriver-QA-RUN
npx playwright show-report
```
