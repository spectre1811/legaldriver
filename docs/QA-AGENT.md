# QA agent (WO-36 Layer 2) — the exploratory tester that reviews the UI like a human

**Advisory, never a merge gate.** Layer 1 (`docs/E2E.md`) is the deterministic gate; this Layer 2 agent
walks the app, judges each screen against the polish rubric, and files bugs — but LLM explorers
over-click and hallucinate, so it only advises; humans (and the deterministic specs) decide.

## What it does
For every route it: navigates (authed via the demo advocate, or as an anon visitor) → captures the
**accessibility tree** (≈200–400 tokens/screen — ~10× cheaper than per-step screenshots, the cost lever
that makes a full-app nightly sweep viable) → asks Claude to review it as a senior product designer and
return **structured findings** (`severity` blocker/high/medium/low/nit · `type` bug/ux/a11y/copy ·
summary · repro · evidence) plus a `uxScore` (1–5) against the four dimensions mirrored from
`docs/ui-polish-bar.md`. It rolls everything into `qa-reports/latest.{md,json}` and can auto-file
`blocker`/`high` findings as GitHub issues.

## Design (files)
| File | Role |
|---|---|
| `qa-agent/findings.mjs` | **Pure logic** (no I/O): finding-hash, dedup, issue-gate, markdown rollup. Fully unit-tested. |
| `qa-agent/findings.test.mjs` | Unit tests — `npm run test:qa` (plain `node`, no deps). |
| `qa-agent/rubric.mjs` | The judge system-prompt + response JSON schema + a11y-tree user message. |
| `qa-agent/run.mjs` | The runner: Playwright (a11y snapshots) + Anthropic SDK + the pure logic. |
| `.github/workflows/qa-sweep.yml` | Nightly + on-demand sweep (dormant until activated). |

**Determinism where it matters:** the agent's *judgment* is non-deterministic, but everything done
*with* its output — dedup (so a recurring bug is commented "still present", not refiled), the
issue-filing gate (blocker/high only; ux/copy → the polish report), and the report rollup — is pure and
unit-tested. That's what keeps a fuzzy agent's effects predictable.

## Running it
```bash
# needs a live DEMO_MODE=1 app + an API key + demo creds:
export E2E_BASE_URL=https://<demo-preview>.vercel.app   # or http://localhost:3000 with the app running
export ANTHROPIC_API_KEY=...  E2E_EMAIL=...  E2E_PASSWORD=...
npm run qa:sweep                 # writes qa-reports/latest.{md,json}
npm run qa:sweep -- --file-issues   # + files/updates GitHub issues (needs GITHUB_TOKEN + GITHUB_REPOSITORY)
npm run qa:sweep -- --routes=/dashboard,/dashboard/cases   # scope to specific routes
QA_MAX_ROUTES=10 npm run qa:sweep   # cost cap
```

## Activating the nightly sweep (founder)
`.github/workflows/qa-sweep.yml` is dormant until:
1. Actions → **Variables**: `QA_ENABLED = true` (optional: `QA_MODEL`, `QA_MAX_ROUTES`).
2. **Secrets**: `QA_TARGET_URL` (a deployed DEMO_MODE=1 instance), `ANTHROPIC_API_KEY`, `E2E_EMAIL`,
   `E2E_PASSWORD`.
Issue-filing uses the built-in `GITHUB_TOKEN` (`issues: write`). Findings carry a hidden `<!--qa:hash-->`
marker so nightly runs comment on recurring issues instead of duplicating them.

## Status
- **Built + unit-tested** (pure logic 7/7; runner + workflow syntax/lint-clean). The live browser+Claude
  loop is validated **on first activated run** (needs the demo env + key — same gate as Layer 1's E2E).
- **Next (Phase 3+):** spec-graduation (an agent-confirmed repeatable bug → a Playwright spec that joins
  Layer 1), a PR-comment summary, and per-route step budgets once real cost data lands.

## Pagination / scale coverage (WO-39)
- **Layer 1 (deterministic):** `e2e/pagination.spec.ts` exercises every paginated surface (cases, clients,
  notices, voice) — reads the `<Pagination>` hooks (`data-testid="pagination"` + `data-page` / `data-per-page`
  / `data-total` / `data-total-pages`; `page-next` / `page-prev` / `per-page-select`), clicks **Next** and
  asserts the page number advances, then changes rows-per-page and asserts it resets to page 1 — all with no
  console/5xx error. Data-volume-safe: a single-page surface asserts no Prev/Next nav renders (nothing to page).
- **Layer 2 (agentic):** the rubric flags a growable list with no pagination affordance as a **bug**.
- **Any new paginated surface is covered automatically** — add its route to the `SURFACES` list in the spec
  (one line). New list pages render `<Pagination page perPage total>` (which carries the `data-*` hooks) below
  the list, driven by `?page`/`?per` searchParams + a `.range()` + `{count:'exact'}` fetch.

## The verification handoff (standing rule — why this matters)
When a change can't be **click-tested in the build environment** (e.g. no demo Supabase creds, so the authed
app can't load data), the last-mile check is **not** waived — it moves here. The PR author MUST, in the same
change, either extend a Layer-1 spec (deterministic, preferred) or add a Layer-2 rubric line so the QA tester
owns the live check, and name that coverage in the PR. "Gates green but I couldn't click it" is only acceptable
if the QA tester now can. (Origin: WO-39 pagination shipped correct-but-unclicked; this spec closes that gap
and makes it a rule for every such change.)
