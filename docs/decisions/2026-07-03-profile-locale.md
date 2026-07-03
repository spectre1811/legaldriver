# Persist UI locale on `profile` (WO-03)

- **Date:** 2026-07-03
- **Status:** PROPOSED — **founder approval required** (schema migration; protocol §1.3)
- **Owner:** design-engineer (WO-03) · **Branch:** `wt/WO-03-locale` (isolated off `main`; NOT in UI PR #1)

## Context
WO-03 Wave 1 scaffolded i18n (`next-intl`, no-routing) with locale resolved from a
`NEXT_LOCALE` cookie → `Accept-Language` → default `en`. The work order's acceptance
criterion "**locale in user profile**" needs a persisted preference so a user's
language follows them across devices/sessions. The `profile` table has **no locale
column** today, so this requires a migration — which is founder-gated. Waves 1–3
shipped cookie-backed on purpose; this closes the gap.

## Decision (proposed)
Add a nullable `profile.locale text` column, constrained to supported/reserved
locales (`en`, `hi`, `gu`). See `supabase/migrations/0029_profile_locale.sql`.

- **Nullable** → `NULL` means "no stored preference", preserving the existing
  cookie/Accept-Language/`en` fallback. Zero behaviour change until a user picks a
  language.
- **No new RLS.** `profile` already has RLS; `profile_update (id = auth.uid())` lets
  a user set only their own locale. Locale is a per-user UI preference — no
  cross-tenant surface.
- **Check constraint** mirrors `src/i18n/config.ts` (`en`/`hi` now, `gu` reserved).

## Wiring (follow-up, lands WITH/after the migration — not in this branch)
Keep the cookie as the **per-request fast path** (no DB hit in `getRequestConfig`).
On login and on language-switch, sync `profile.locale` → the `NEXT_LOCALE` cookie:

- **Language switcher** (`setLocale` in `src/lib/locale.ts`): also `update` the
  caller's `profile.locale` (RLS-scoped to `auth.uid()`).
- **Login callback** (`/auth/callback`): read `profile.locale`; if set, seed the
  `NEXT_LOCALE` cookie so the very first authed render uses the stored language.

This avoids a Supabase query on every request while making the profile the durable
source of truth. `getStoredLocale()` stays cookie-first, so no hot-path change.

## Rollout
Expand-only, non-destructive (additive nullable column) → safe under the
expand→migrate→contract rule; no backfill needed (NULL is valid). Regenerate
`src/lib/db/database.types.ts` (`npm run db:types`) after applying.

## Approve to proceed
On founder approval: apply `0029` to the project, regenerate DB types, then land the
wiring above (RLS/tenancy tests unaffected — no policy change).
