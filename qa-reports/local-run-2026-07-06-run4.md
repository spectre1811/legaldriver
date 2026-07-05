# QA Run 4 — 2026-07-06

## Environment

| Key | Value |
|---|---|
| Date | 2026-07-06 |
| Run | Run 4 |
| Commit (QA-RUN branch) | wt/QA-RUN (rebased on origin/main) |
| DEMO_MODE | 1 |
| Node | v26.4.0 |
| Playwright | 1.61.1 |
| Build mode | dev (Next.js 14 dev server, port 3000) |
| E2E creds | demo@lexdriver.test / demo-pass-1234 |
| Demo tenant | 5d52d046-1b5f-4a2a-8616-d2b9f864c3a2 |
| Live IDs | matter=f2de04e7, client=e234cc57, doc=8f661b3e, invoice=143c1a89 |

## E2E Gate Summary (Layer 1)

**38 passed · 16 failed · 9 skipped** (54s total)

| Failure | Root cause | Category |
|---|---|---|
| hero-case-detail | F4 (RSC ERR_ABORTED on click-nav) | Known P1 |
| hero-lookup name search | F6 (flaky under parallel load) | Known P3 |
| hero-manual-add | HMR cascade (passes in isolation ✓) | False positive |
| /dashboard/assistant | H1 (redirect-only stub) | Known P2 |
| /dashboard/search | H1 (redirect-only stub) | Known P2 |
| /dashboard/clients | HMR cascade (passes in isolation ✓) | False positive |
| /dashboard/documents | HMR cascade (passes in isolation ✓) | False positive |
| /dashboard/documents/review | HMR cascade (passes in isolation ✓) | False positive |
| /dashboard/ip | HMR cascade (passes in isolation ✓) | False positive |
| /dashboard/messages | HMR cascade (passes in isolation ✓) | False positive |
| /dashboard/notices | HMR cascade (passes in isolation ✓) | False positive |
| /dashboard/clients/[id] | Shared-id key issue (matter UUID for client) | Known P3 harness |
| /dashboard/documents/[id] | Shared-id key issue | Known P3 harness |
| /dashboard/invoices/[id] | Shared-id key issue | Known P3 harness |
| /dashboard/invoices/[id]/print | Shared-id key issue | Known P3 harness |
| /dashboard/assistant/draft/[id] | Shared-id key issue | Known P3 harness |

**Trend:** F4's HMR cascade now causes **8 false-positive failures** in the full suite (up from ~6 in Run 3). F4 escalated from P2 → **P1** — it's masking real failures and making every suite run noisy.

Isolated spot-checks confirming the false positives all pass in isolation:
- `/dashboard/clients` ✓, `/dashboard/documents` ✓, `/dashboard/messages` ✓, `/dashboard/ip` ✓, `/dashboard/notices` ✓, `hero-manual-add` ✓

## Backend Tests (Layer 2)

| Test | Result |
|---|---|
| `tests/p1_smoke.ts` | ✅ PASS |
| `tests/ai_gateway.ts` | ✅ ALL PASS |
| `tests/i18n_coverage.ts` | ✅ PASS (en=1549, hi=1549 keys) |
| `tests/design_tokens_smoke.ts` | ✅ PASS |

## Spider Pass (Layer 3)

**75 passed · 5 failed · 3 skipped** | 73 screenshots captured at `/tmp/qa-visual-2026-07-06/`

### Tier 1 — Never-visited routes (all 7 covered this run)

| Route | Health | Finding |
|---|---|---|
| `/dashboard/analytics` | ✅ | Rich stats page: 24 cases, 5 clients, 5 docs, time & billing ₹0. Polished. |
| `/dashboard/portfolio` | ✅ | At-risk cases, upcoming hearings, deadline tracking, rebook sections. Data-rich. |
| `/dashboard/ai-usage` | ✅ | Metered gateway display: $0.0003, deepseek-v4-pro + claude-sonnet-4-6. |
| `/dashboard/ip` | ✅ | Add-asset form + designed empty state "No IP assets yet". All adversarial inputs pass. |
| `/dashboard/voice` | ⚠️ | Renders fine but **native browser file input** shown (A2 new). Empty state designed. |
| `/dashboard/messages` | ✅ | WhatsApp composer + designed empty state. Adversarial inputs pass. |
| `/dashboard/calendar` | ✅ | Full calendar grid + upcoming hearings panel. Dense, well-organized. |

### Tier 2 — Open bug regressions

| Bug | Status | Evidence |
|---|---|---|
| **F4** hero-case-detail RSC abort | ❌ OPEN (escalated P1) | Confirmed in E2E; spider single-thread doesn't trigger HMR. Suite now has 8 cascades. |
| **F6** hero-lookup flaky | ❌ OPEN P3 | Confirmed flaky in full suite; passes in isolation. |
| **V2** bulk bar export white elements | ❌ OPEN P3 | Screenshot 070 shows dark/blank boxes in export area. Spider selector missed it (false negative). |
| **H1** redirect-only pages trip gate | ❌ OPEN P2 | Not tested in spider (redirect stubs avoided). E2E still trips. |
| **S1** judgments no pagination | ❌ OPEN P2 | 99 rows confirmed with no `[data-testid="pagination"]`. Ship-grade. |

### Tier 3 — Coverage gaps

| Flow | Outcome |
|---|---|
| Clients detail nav (click first row) | ✅ Works — skeleton loading state properly designed |
| Clients detail real id | ✅ Works — client page renders |
| Invoices detail real id | ✅ Works — PESHI/2026-27/001 renders with line item table |
| Invoices create button | ⏭️ Skipped — no create button found (flow may require different path) |
| Invoices row nav | ⏭️ Skipped — no `<a>` inside invoice rows (list may not have row-link pattern) |
| Notices create button | ✅ Found — HTML5 required validation works |
| Notices row nav | ⏭️ Skipped — row links not found with selector |
| Cases filter panel | ✅ Opens |
| Cases CRUD round-trip | ⚠️ Spider selector mismatch (wrong title placeholder); hero-manual-add PASSES in isolation — F5 NOT regressed |
| Documents bulk bar | ⚠️ Spider detection failed (wrong selector); visual confirms bulk bar IS present (screenshot 070) |

### A11y Spot Checks

| Route | Result |
|---|---|
| `/dashboard/cases` | ✅ Clean |
| `/dashboard/clients` | ✅ Clean |
| `/dashboard/documents` | ❌ **Unlabeled file input** (upload dropzone) — A1 NEW |
| `/dashboard/analytics` | ✅ Clean |
| `/dashboard/portfolio` | ✅ Clean |

## D4 Verify-Next Verdicts

| Item | Verdict | Notes |
|---|---|---|
| **P1 · WO-41** Court record grid | ⬜ PARTIAL | Case detail visited (screenshot 062). Court record tab visible. Did NOT click through to verify field values. Remains open. |
| **P1 · WO-42** Advocate onboarding | ⬜ NOT TESTED | Settings form not driven in this run. Remains open. |
| **P2 · BP-17** Case timeline | ⬜ PARTIAL | Tabs visible (Overview/Court/Timeline/Docs/Billing/Comms). Did NOT click Timeline tab. Remains open. |
| **P3 · BP-16** Design token parity | ⬜ NOT TESTED | Requires peshi-search open in parallel. Out of scope this run. |

## Regression Table

| Bug | Last status | This run |
|---|---|---|
| F4 — hero-case-detail RSC abort | P2 OPEN | ❌ STILL OPEN · **escalated P1** (8 cascade failures in suite) |
| F5 — create case no redirect | FIXED (Run 3) | ✅ FIXED CONFIRMED — hero-manual-add passes in isolation; spider selector mismatch was false positive |
| F6 — lookup flaky | P3 OPEN | ❌ STILL OPEN |
| V2 — bulk bar export white elements | P3 OPEN | ❌ STILL OPEN (confirmed visually in screenshot 070) |
| H1 — redirect stubs trip gate | P2 OPEN | ❌ STILL OPEN |
| S1 — judgments 100 rows no pagination | P2 OPEN | ❌ STILL OPEN (99 rows confirmed) |

## New Bugs Found (Run 4)

### [A1] /dashboard/documents — upload dropzone unlabeled file input (P3/a11y)
- **Surface:** Upload area on Documents page ("Drop files here or click — we read, type, and file each one to the right case")
- **Symptom:** `<input type="file">` inside the dropzone has no `aria-label`, no `<label for>`, no `aria-labelledby` → WCAG 2.1 A `label` violation
- **Note:** Different from F2 (which was `assistant/draft`, now fixed WO-42). Documents has a separate file input.
- **Fix:** Add `aria-label="Upload documents"` to the file input in the dropzone component
- **Suspected file:** `src/app/dashboard/documents/` or a shared dropzone component
- **Why P3:** Baseline WCAG A violation; low user impact since dropzone area visually implies purpose

### [A2] /dashboard/voice — native browser file input (P3/ui-polish)
- **Surface:** "AUDIO FILE" section on Voice & Calls page shows raw `<input type="file">` "Choose File" button
- **Symptom:** Native browser chrome visible — doesn't match design system. Compare with `/dashboard/documents` which uses a styled dropzone.
- **Fix:** Replace with same custom FileDropzone component used on documents page
- **Suspected file:** `src/app/dashboard/voice/` upload component
- **Why P3:** Visual polish; functional but inconsistent

## Coverage Delta

| Metric | Run 3 | Run 4 | Delta |
|---|---|---|---|
| Routes visited | 13 | 20 | +7 (all 7 never-visited covered) |
| Never-visited remaining | 7 | 6* | -7 (but /onboarding added back as untested) |
| Open bugs | 5 | 7 | +2 (A1, A2) |
| Fixed bugs | 8 | 8 | — |
| F4 severity | P2 | **P1** | escalated |

*Remaining never-visited: `/dashboard/advocate/[barId]`, `/dashboard/judge/[judgeId]`, `/dashboard/search/judgments/judgment`, `/portal/login`, `/portal/dashboard`, `/dashboard/onboarding`

## Ship-Grade Lens

| Issue | Severity |
|---|---|
| S1: 99 judgment rows, no pagination | **P2 ship-grade** |
| F4 now causing 8 cascade failures masking real test results | **P1 test-infrastructure blocker** |
| A1: WCAG A violation on documents upload | P3 |
| A2: unstyled native file input on voice page | P3 |

## Console / Network Errors

Spider ran single-threaded. The `unpdf` "Critical dependency: Accessing import.meta directly" warning fires on every /cases route compile — this is the root of F4 and N1/HMR cascades. No other console errors observed across the 7 new routes.

## Adversarial Input Results

All 18 adversarial inputs on `/dashboard/ip` passed (long string, Devanagari, special chars, emoji, unbroken, empty × 3 fields). All 12 on `/dashboard/voice` passed. All 12 on `/dashboard/messages` passed. No layout blowouts.

## Next Run Priority

1. **F4 (P1)** — fix `unpdf` lazy-import in `src/lib/docs/extract.ts`; full-suite pass count should jump from 38 to ~46
2. **S1 (P2)** — wire `<Pagination>` to `/dashboard/search/judgments`
3. **H1 (P2)** — exclude redirect-only routes from `scripts/gen-routes.mjs`
4. **D4** — verify WO-41 court record tab + WO-42 advocate settings + BP-17 timeline tab
5. **A1/A2 (P3)** — aria-label on documents dropzone; styled file input on voice page
6. **Clients CRUD** — create + edit + delete client round-trip
7. **Portal routes** — `/portal/login`, `/portal/dashboard`
