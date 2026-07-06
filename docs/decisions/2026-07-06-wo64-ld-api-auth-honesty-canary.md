# WO-64 · LD-API auth — verifiable key + synthetic canary + honest failure state

**Date:** 2026-07-06 · **Status:** accepted · **Session:** S-WO64-opus-20260706
**Priority:** P0 (from the 2026-07-06 onboarding deep-dive) · **Branch:** `wt/WO-64` · **Gated?** no (no migration; no auth/RLS/billing)

## Why (the incident)
The prod `LD_API_KEY` had rotted to a corrupt **1076-char double-encrypted blob** (`{"v":"v2","c":…}`)
instead of the real `ld_…` key. Every app→box call (warehouse read + roster refresh) returned **401 →
0 cases**, for **every advocate**, silently, for days. Three independent gaps let it happen and stay
hidden:

1. **Unverifiable key** — stored as a Vercel **"sensitive"** secret whose value can't be read back, so
   every "I set the key" was unverifiable; a corrupt value was invisible.
2. **No monitoring** — nothing ever asked the box "does auth work?", so a 100%-failure state produced
   zero signal.
3. **Dishonest empty** — the app said "no source configured" only when the key was *unset*; a
   *set-but-wrong* (401) key rendered as the reassuring **"still fetching your cases…"**, hiding a hard
   failure as normal latency. Root cause in code: `legaldriverProvider`'s `get()` did `r.ok ? json :
   null` — a 401 became an indistinguishable empty result with **no error recorded**, so `stepFetch`
   saw `errors:[] + 0 cases + livePending:true` and picked the "still fetching" copy.

The immediate blocker (re-set the key + redeploy → 0→80 cases) was fixed in the deep-dive session. This
WO is the **hardening so it can't silently recur.**

## Decisions

### 1. Classify fetch failures, never swallow them (`advocate-cases.ts`)
- `classifyHttpStatus(status)` — the pure kernel: `401/403 → "auth"`, `≥500 → "source_down"`,
  everything else (incl. `404`) → `null` (a valid empty answer is **not** a failure).
- `ProviderError{source, kind}` — providers throw this on a hard/transport failure so the
  classification **survives the merge** into `AdvocateFetchMeta.errors` (which now carries `kind`)
  instead of collapsing to a bare `[]`. The LD provider's `get()` now throws on `401/403` (auth),
  `≥5xx` (source_down), and network/timeout (source_down); `404` stays a null (empty) answer.
- This extends the WO-58 anti-blackhole contract from *"record that a source threw"* to *"record **why**
  it failed"*.

### 2. Honest onboarding copy from the classified outcome (`onboardingFetchNote`, pure)
A single pure selector chooses the user-facing note, exported + offline-tested. Precedence:
`not-configured → **auth-failed** → source-down → other-named → still-fetching → (quiet)`. **Auth
failure dominates a `livePending` flag**, so a 401 can never read as "still fetching". `stepFetch` also
**clears** a stale `cursor.fetch_pending` on auth failure so the `isGathering` "still gathering…" UI
stops alongside the note, and it does **not** fire the doomed async refresh POST when auth is already
rejected.

### 3. Synthetic canary (`/api/cron/ld-api-canary` + `ld-api-canary.ts`)
A scheduled probe (Vercel cron, `Bearer CRON_SECRET`, every 6h) authenticates against the box for a
known advocate (`G/702/2020`, expected non-empty) and writes an OK/ALARM row to the existing
`court_provider_health` table under provider `legaldriver-canary` — the surface `getProviderHealth()`
already reads for diagnostics/fleet health. It **alarms on 401 / 5xx / unreachable / authed-but-empty**
(the last catches a wrong key that still 200s), returns a non-2xx body on alarm (so external uptime
pings + logs see red), and doubles as an **on-demand** probe a tighter-cadence monitor can hit. The
classification kernel `evaluateCanary()` is pure + offline-tested. WO-63's deploy-freshness alarm can
piggyback on the same health row.

### 4. Verifiable key (`scripts/verify-ld-api-key.mjs`, `npm run verify:ld-key`)
A standalone one-liner that authenticates a candidate `LD_API_KEY` against the box and reports
200-with-cases / 401 / 5xx / unreachable — run it **before** storing a value to confirm it. It also
fast-fails if handed an encrypted `{"v":…,"c":…}` envelope (the exact incident shape). **Operational
decision (flagged to founder — env config, not code):** store `LD_API_KEY` as a **readable**
(non-"sensitive") encrypted Vercel env so it can be read back and verified; a write-only secret is what
made the corruption invisible.

## Root cause of the double-encryption
No code path in the app **ever encrypts** `LD_API_KEY` (verified: the only crypto helper is the Gmail
OAuth/Vault path, which is unrelated). The `{"v":"v2","c":…}` envelope is therefore an **ops/set-time**
artifact — an already-encrypted value (a Supabase-Vault/secret-manager-shaped payload) pasted into the
plaintext `LD_API_KEY` slot. The durable countermeasure is **verifiability + monitoring + a readable
env** (this WO), not an app change — plus the verify script's envelope-shape guard to catch a repeat at
set-time.

## Scope / non-goals
- No schema change (reuses `court_provider_health`), no migration, nothing gated.
- Pushing the alarm into the exec-pack `FOUNDER-ACTIONS.md` (a separate repo, generated by
  `gen_founder_actions.py`) is out of this repo's scope; the machine-readable signal is the health row +
  the canary's non-2xx response, which the fleet reads.

## Tests
`tests/wo64_auth_honesty.ts` (offline, CI-gated): the classifier, the provider threading (401→auth,
5xx/network→source_down, 404→empty-no-error, 200→cases), the honest-note selector (auth beats
live-pending), and the canary evaluator. All green + typecheck + lint + build.
