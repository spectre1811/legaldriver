# 2026-07-06 — Login & signup redesign (WO-50)

**Status:** accepted (founder-gated: auth — PR presented, not self-merged)
**Supersedes:** WO-30's auth-UI wave (founder ruling 2026-07-06). WO-30 keeps console/Settings/⌘K and must not touch `src/app/login/**` or `src/app/auth/**`.

## Problem
`/login` was one form (Full name + Email + Password) with two competing CTAs. Sign-up sent a
confirmation email, dumped the user back on the same form, and expected them to guess that
email+password now works. No pending states, no inline errors, no password reset, and the
Google button failed silently: the Supabase **Google provider was never configured**
(FOUNDER-ACTIONS #6 — only the Gmail-ingest OAuth exists) while `/auth/callback` swallowed
`exchangeCodeForSession` failures into a bare `/login?error=Could not sign in` bounce.

## Decision
1. **Two explicit modes, method-first.** `/login` renders Sign in OR Create account (client-side
   toggle + `?mode=` deep link): "Continue with Google" on top, divider, email+password below.
   Sign-in has no name field and a "Forgot password?" link. **Full name moves to onboarding** —
   signup collects email+password only (`handle_new_user` tolerates a missing name).
2. **Explicit confirm screen.** Sign-up (and sign-in against an unconfirmed account) lands on a
   "Check your inbox — we emailed a link to {email}" screen with **resend** and **change email**.
   The email travels via form state, never the URL (no-PII rule).
3. **Stable error codes, not provider prose.** Actions return codes (`wrongPassword`, `noAccount`,
   `unconfirmed`, `accountExists`, `googleUnavailable`, …) mapped in `src/lib/auth/errors.ts`;
   the UI renders translated copy (EN+HI full parity). GoTrue deliberately answers "Invalid login
   credentials" for both wrong-password and no-account; we disambiguate server-side via the GoTrue
   **admin users endpoint** (service role, exact-match, fails soft to combined copy). The founder
   accepted the account-enumeration trade-off by specifying distinct copy in the WO.
4. **Forgot-password end-to-end.** `resetPasswordForEmail` → recovery link → `/auth/callback`
   (code exchange) → `/reset-password` (`updateUser`), with an explicit expired-link state.
   Neutral "if that email has an account…" copy on request (no enumeration on this path).
5. **Callback failures are visible.** `/auth/callback` now redirects to `/auth/error?reason=…`
   (provider refusal / missing code / exchange failure) with a retry that keeps `?next=`.
6. **Intent survives the round-trip.** `?next=` and `?track=<CNR>` are sanitised
   (`src/lib/auth/redirects.ts`), carried through password, signup-confirmation and OAuth flows
   via an explicit `redirectTo`, remembered by the middleware when it bounces an
   unauthenticated deep link to `/login`, and honoured when a signed-in user hits `/login`.
   `?track=` resolves to `/dashboard/cases?track=<CNR>`, where the add-case form prefills and
   auto-submits once (WO-51's legaldriver leg riding this PR).
7. **Middleware semantics touched, narrowly** (flagged per WO "room to think"): the
   unauth-redirect now sets `?next=` + an i18n `notice` code instead of hard-coded English, and
   the signed-in `/login` redirect resolves the deep-link intent instead of stripping the query.
   Session refresh, confirmation gating and portal routing are unchanged.

## Root cause of "Google sign-in even fails" — REVISED (W2b, same day)
First hypothesis (provider not configured) was **wrong**: the founder verified the dashboard —
Google provider enabled, Site URL + allow-list correct. The real root cause was in code:
`signInWithGoogle` (and every `emailRedirectTo`) built its base from
`process.env.APP_BASE_URL ?? "http://localhost:3000"`. Any deployment without that env var —
**Vercel previews in particular** — bounced the browser to localhost after Google auth, or to
prod from a preview, where the PKCE `code_verifier` cookie doesn't exist →
`exchangeCodeForSession` fails → the old generic "Could not sign in". Hence "fails *sometimes*":
it depended on which deployment the user started from.

**Fix:** `requestOrigin(headers())` in `src/lib/auth/redirects.ts` — prefer
`x-forwarded-host` + `x-forwarded-proto` (Vercel sets both), then `host`, then `APP_BASE_URL`,
then localhost — used as the base for **all** `redirectTo`/`emailRedirectTo` call sites (Google
OAuth, signup confirm, resend, password reset). The flow now always returns to the domain it
started on. Prod + localhost are already on the Supabase allow-list; previews need the
`https://*.vercel.app/auth/callback` wildcard entry (noted in `docs/AUTH-SETUP.md`).
The `googleUnavailable` plain-language error mapping stays — it's still correct if the provider
is ever toggled off.

## Tests
`tests/wo50_auth_flows.ts` (offline): sanitisers, destination resolution, error mapping,
EN+HI parity for every error code, and source contracts (no name field at signup, explicit
`redirectTo`, no silent callback bounce, middleware preserves intent). Playwright journeys are
Wave 3 (gated on E2E secrets, WO-36).
