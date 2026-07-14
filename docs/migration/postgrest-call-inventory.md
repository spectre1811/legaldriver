# PostgREST / supabase-js Call Inventory

**WO-142 · W0 · Migration-prep · 2026-07-14**

## What this is

An inventory of every data-access call that currently goes through the Supabase
PostgREST API (`supabase-js` `.from()` / `.rpc()`), plus every Supabase Auth and
Storage call in the legaldriver codebase.

## Why it matters for the migration

The Vercel/Supabase → AWS migration replaces PostgREST/`supabase-js` table access
with **server-side SQL** (Drizzle/Kysely against a self-hosted Postgres) **before**
the DB cutover. This inventory is the map of that replacement work: each `.from()`
call site becomes a query to port. It also separates the three concerns that move to
**different** systems:

- **Table access** (`.from()` / `.rpc()`) → server-side SQL (the bulk of the work).
- **Auth** (`supabase.auth.*`) → stays on **GoTrue** (self-hosted) — sessions/cookies
  unchanged, so these calls largely survive.
- **Storage** (`supabase.storage.*`) → moves to **S3** — must be reworked.

## How it was generated

Grep-derived over `src/` and `scripts/` (`*.ts`, `*.tsx`) on 2026-07-14. Counts come
from `grep`/`ripgrep` plus a Python pass that (a) matches `.from('<table>')` allowing
whitespace/newlines inside the call, (b) captures the operation method chained after
each `.from()`, and (c) attributes each call to a client kind by the client variable
and the file's client imports. Counts are **approximate** — treat them as ballpark,
not audited exact. Two independent methods (strict quoted-string grep and the
whitespace-tolerant Python matcher) both land at **521** `.from()` calls, in the
ballpark of the ~492 the WO estimated.

---

## Summary

| Metric | Count |
|---|---|
| Total `.from('<table>')` calls | **521** |
| Total `.rpc('<fn>')` calls | **4** (3 in `src/`, 1 in `scripts/`) |
| Distinct tables touched | **51** |
| Distinct RPC functions | **4** (`analytics_summary`, `store_secret`, `read_secret`, `match_document_chunks`) |
| Storage API calls (`storage.from(...)`) | **9** (one bucket: `documents`) |
| Auth calls (`supabase.auth.*`) | **44** (35 = `getUser`; 9 = auth flows) |
| Realtime subscriptions (`.channel(`/`.subscribe(`) | **0 — none** |
| Browser-client call sites (RLS via anon key) | **0** — factory imported by nothing |
| Server-client call sites (RLS via user JWT/cookies) | ~71 files |
| Service-role call sites (RLS **bypassed**) | 34 files import `createAdminClient` / service-role key |

**Headline surprise:** the browser client (`src/lib/supabase/client.ts`) is exported
but **imported by nothing** — no client component does a `.from()` directly. **All**
data access is server-side (server client + service-role). That removes an entire risk
class (client-side RLS reads over the wire) from the migration.

---

## Client-construction helper modules

| Path | Client kind | Underlying | RLS |
|---|---|---|---|
| `src/lib/supabase/client.ts` | Browser client (`createClient`) | `createBrowserClient` (anon key) | **RLS-enforced** — but **unused** (no importers, no `.from()`) |
| `src/lib/supabase/server.ts` | Server client (`createClient`) | `createServerClient` (anon key + user session cookies) | **RLS-enforced** via user JWT; `fetch` set `cache: "no-store"` |
| `src/lib/supabase/middleware.ts` | Session/route-guard client (`updateSession`) | `createServerClient` (anon key + request cookies) | **RLS-enforced**; refreshes session + gates routes, no table access |
| `src/lib/supabase/admin.ts` | **Service-role client** (`createAdminClient`) | `createSupabaseClient` w/ `SUPABASE_SERVICE_ROLE_KEY` | **BYPASSES RLS** — server-only; must filter `tenant_id` manually; `cache: "no-store"` |
| `scripts/{reset,seed,verify}-demo.ts`, `scripts/classify-worker.ts` | Ad-hoc service-role | `createClient` from `@supabase/supabase-js` w/ service-role key | **BYPASSES RLS** — offline scripts |

Note: `src/lib/supabase/server.ts` and `src/lib/supabase/client.ts` **both** export a
function named `createClient`. App code imports the **server** one from
`@/lib/supabase/server`; that is the ubiquitous RLS-enforced path. The service-role
client is always named `createAdminClient` (or `admin`).

---

## Per-table breakdown

Sorted by approximate call count (descending). "Reached via" lists every client kind
observed for that table across call sites. `server` = RLS-enforced server client;
`service-role` = RLS-bypassing admin client. Ops are the chained methods observed.
Counts and op/reach attribution are grep-approximate.

| Table | ~Calls | Operations | Reached via |
|---|---|---|---|
| `matter` | 91 | select, insert, update, delete | server, service-role |
| `document` | 57 | select, insert, update, delete | server, service-role |
| `audit_event` | 41 | select, insert | server, service-role |
| `client` | 32 | select, insert, delete | server, service-role |
| `invoice` | 18 | select, insert, update | server, service-role |
| `notification` | 18 | select, insert, update, delete | server, service-role |
| `onboarding_run` | 13 | select, insert, update, delete | server, service-role |
| `email_message` | 12 | select, insert, update | server, service-role |
| `hearing` | 11 | select, insert, delete | server, service-role |
| `profile` | 11 | select, update | server, service-role |
| `deadline` | 11 | select, insert, update | server |
| `advocate` | 11 | select, insert, delete | server, service-role |
| `draft` | 11 | select, insert, update | server, service-role |
| `draft_version` | 11 | select, insert, update | server, service-role |
| `documents` (view/alias) | 10 | select | server, service-role |
| `voice_recording` | 10 | select, insert, update | server, service-role |
| `agent_turn` | 9 | select, insert, update | server, service-role |
| `oauth_connection` | 9 | select, insert, update, delete | server, service-role |
| `invoice_line` | 9 | select, insert, delete | server, service-role |
| `notice` | 9 | select, insert, update, delete | server, service-role |
| `tenant` | 8 | select, update, delete | server, service-role |
| `firm_billing` | 8 | select, upsert | server |
| `court_order` | 8 | select, insert, delete | server |
| `portal_user` | 7 | select, insert, delete | server, service-role |
| `capture_token` | 6 | select, insert, update | server, service-role |
| `msg_message` | 6 | select, insert, update | server, service-role |
| `agent_thread` | 5 | select, insert, update | server, service-role |
| `activity_event` | 5 | select, insert | server, service-role |
| `time_entry` | 5 | select, insert, update | server |
| `expense` | 5 | select, insert, update | server |
| `court_cache` | 5 | select, upsert | **service-role only** |
| `portal_message` | 4 | select, insert | server |
| `calendar_event` | 4 | select, insert, delete | server |
| `cause_list_entry` | 4 | select, insert, upsert | server, service-role |
| `ip_asset` | 4 | select, insert, delete | server |
| `deadline_rule` | 4 | select | server |
| `court_provider_health` | 4 | select, upsert | **service-role only** |
| `court_refresh_request` | 3 | select, insert, update | server, service-role |
| `saved_view` | 3 | select, insert, delete | server |
| `notification_prefs` | 2 | select, upsert | server |
| `ai_usage_event` | 2 | select, insert | server, service-role |
| `draft_template` | 2 | select | server |
| `legal_reference` | 2 | select | server |
| `corpus_source_batch` | 2 | insert, update | **service-role only** |
| `corpus_judgment` | 2 | select, upsert | **service-role only** |
| `document_chunk` | 2 | select, insert | **service-role only** |
| `practice_area` | 1 | select | server |
| `communication_log` | 1 | select | server |
| `adverse_party` | 1 | select | server |
| `outbound_email` | 1 | insert | server |
| `corpus_ingest_watermark` | 1 | upsert | **service-role only** |

(`documents` appears distinct from `document` in grep output — likely a view/alias or a
storage-path helper; verify during port whether it maps to the same physical table.)

---

## Migration notes — riskiest to port

Ranked by how much the current behavior depends on Supabase-specific semantics that
plain SQL will **not** reproduce for free.

### 1. Service-role (RLS-bypass) call sites — highest risk

34 files construct/import the service-role client (`createAdminClient`, or the
service-role key directly). These queries **bypass RLS**, so tenant isolation is done
**manually** in application code (`.eq('tenant_id', ...)`). When ported to Drizzle/Kysely
there is no RLS backstop at all — **any missing `tenant_id` filter is a cross-tenant
data leak**. Every service-role query must be re-verified to carry an explicit tenant
scope. Highest-volume service-role reach: `cases/actions.ts` (43 `.from()`),
`documents/actions.ts` (19), `assistant/draft/actions.ts` (17), `onboarding/actions.ts`
(14), `inbox/actions.ts` (12), `clients/[id]/actions.ts` (11); plus all `api/cron/*`
routes and `lib/court/gateway.ts`.

Tables reached **only** via service-role (no RLS-enforced path exists today — treat as
system/internal tables): `court_cache`, `court_provider_health`, `corpus_source_batch`,
`corpus_judgment`, `document_chunk`, `corpus_ingest_watermark`.

### 2. `.rpc()` functions — server-side DB functions, port each explicitly

Only 4 call sites, but each calls a **Postgres function** that must exist in the new DB
(or be reimplemented in SQL/app code):

| RPC | Called from | Notes |
|---|---|---|
| `analytics_summary` | `src/app/dashboard/analytics/page.tsx:39` | server client (RLS) — aggregate rollup; port as SQL/view or Kysely query |
| `store_secret` | `src/lib/mail/vault.ts:10` | **Supabase Vault** — service-role. Vault is Supabase-specific; needs an S3/KMS/Secrets-Manager replacement for encrypted OAuth refresh tokens |
| `read_secret` | `src/lib/mail/vault.ts:16` | **Supabase Vault** — same as above |
| `match_document_chunks` | `scripts/classify-worker.ts:171` | **pgvector** similarity search (`p_embedding`, `p_k`) — port needs pgvector on the new Postgres |

`store_secret`/`read_secret` (Vault) and `match_document_chunks` (pgvector) are the two
that are not just "rewrite the SQL" — they depend on Supabase extensions/services.

### 3. Storage calls — move to S3

9 `storage.from("documents")` calls, all against one bucket `documents`, all via the
service-role client (except `src/lib/mail/ingest.ts` which uses the server client).
Operations: `upload` (×3), `remove` (×2), `download` (×2), `createSignedUrl` (×2).
`createSignedUrl` → S3 presigned GET; `upload`/`download`/`remove` → S3 SDK calls.
Sites: `assistant/draft/actions.ts`, `voice/actions.ts`, `voice/voice-query.ts`,
`documents/actions.ts`, `api/documents/export/route.ts`,
`api/documents/[id]/download/route.ts`, `lib/mail/ingest.ts`, `lib/docs/file-upload.ts`,
`lib/services/voice/stt.ts`, `scripts/classify-worker.ts`. The `storage_path` column on
`document`/`voice_recording` rows is the S3 key today — should map cleanly to S3 keys.

### 4. Auth calls — stay on GoTrue, low risk

44 `supabase.auth.*` calls. 35 are `getUser()` (the per-request RLS-identity read); the
other 9 are the auth flows, all in two files:
- `src/app/login/actions.ts`: `signInWithPassword`, `signUp`, `resend`,
  `resetPasswordForEmail`, `updateUser`, `signInWithOAuth`
- `src/app/auth/signout/route.ts`: `signOut`; `src/app/auth/callback/route.ts`:
  `exchangeCodeForSession`

Auth stays on GoTrue, so these calls largely survive as-is. The coupling to watch:
`getUser()` returns the identity that RLS keys on. Once table access moves off
PostgREST, `getUser()` still gives the identity, but the **tenant-scoping that RLS did
automatically must now be applied in every query** (see item 1). This is the seam where
the migration is riskiest even though auth itself barely changes.

### 5. Good news / low risk

- **No realtime.** Zero `.channel(` / `.subscribe(` — no Supabase Realtime to replace.
- **No client-side table access.** The browser client is unused; all `.from()` runs
  server-side, so there's no over-the-wire RLS to reproduce and no anon-key surface to
  re-secure. Migration is entirely a server-side query rewrite.
- **`fetch` cache workaround** (`cache: "no-store"` in `server.ts`/`admin.ts`) is a
  Next.js-over-PostgREST quirk that simply disappears once queries are direct SQL.
