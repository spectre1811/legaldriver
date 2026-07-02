---
name: supabase-rls-multitenant
description: Use whenever adding a tenant-owned table, writing RLS policies, or wiring Supabase clients in a multi-tenant Next.js app (e.g. LexDriver). Fires on "new table", "RLS policy", "tenant isolation", "supabase client", "service role", "stale/empty query results from a route handler". Codifies deny-by-default RLS keyed to current_tenant_id(), the browser/server/admin client trio, and the Next.js fetch-cache gotcha that silently serves stale supabase reads.
---

Multi-tenant Postgres on Supabase with real isolation via Row-Level Security. One firm = one tenant; every tenant-owned row carries `tenant_id`; policies filter on the authed user's tenant. Battle-tested in LexDriver.

## When to fire
- Adding any tenant-owned table → it MUST get `tenant_id` + 4 RLS policies before use.
- Creating/reviewing a Supabase client in app code.
- Debugging "my query returns 0 rows in the server but data exists" (almost always the fetch-cache bug below).

## The tenant model
- `tenant(id, ...)`, `profile(id → auth.users, tenant_id, role)`.
- A `SECURITY DEFINER` function resolves the caller's tenant (no recursion):
  ```sql
  create or replace function current_tenant_id() returns uuid
  language sql stable security definer set search_path = public as $$
    select tenant_id from profile where id = auth.uid();
  $$;
  ```
- New-user bootstrap: an `after insert on auth.users` trigger (SECURITY DEFINER) creates a tenant + owner profile so each user lands in an isolated workspace.

## Every tenant-owned table (non-negotiable)
```sql
alter table X enable row level security;  -- deny-by-default
create policy X_select on X for select using (tenant_id = current_tenant_id());
create policy X_insert on X for insert with check (tenant_id = current_tenant_id());
create policy X_update on X for update using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
create policy X_delete on X for delete using (tenant_id = current_tenant_id());
```
Loop the list with a `do $$ ... foreach ... execute format(...) $$` block (see LexDriver `0001_init.sql`). Append-only tables (audit): grant `select` + `insert` only — no update/delete policy = denied.

## The three clients (the important part)
- **browser** (`createBrowserClient`, anon key) — client components, RLS-enforced.
- **server** (`createServerClient` from `@supabase/ssr`, anon key + cookies) — Server Components/Actions, RLS-enforced.
- **admin** (`createClient` from `@supabase/supabase-js`, **service-role key, BYPASSES RLS**) — server-only (cron, webhooks). Always filter by `tenant_id` MANUALLY here; RLS won't.

## ⚠️ Two gotchas that cost hours (codified so they don't recur)
1. **Next.js caches `fetch()` by default and supabase-js uses fetch internally** → server-side queries get served STALE/empty from the Data Cache, even with `export const dynamic = "force-dynamic"`. **Every server/admin client MUST pass a no-store fetch:**
   ```ts
   global: { fetch: (url, opts) => fetch(url, { ...opts, cache: "no-store" }) }
   ```
   Symptom: a row you just inserted is invisible to a route handler but visible to a standalone client with the same key. This is the cause 90% of the time — check it FIRST.
2. **`@supabase/ssr` version vs supabase-js typed selects:** old ssr (≤0.5) with new supabase-js (≥2.10) makes every typed `.select()` infer `never`. Fix: upgrade `@supabase/ssr` to latest (0.12+).

## Types
Generate from the live schema, never hand-edit: `supabase gen types typescript --linked`, or the Management API `GET /v1/projects/{ref}/types/typescript`. Regenerate after every migration. One owner for the generated file; everyone imports it.

## Vault (encrypted secrets, e.g. OAuth refresh tokens)
`create extension supabase_vault`; wrap `vault.create_secret` / `vault.decrypted_secrets` in `SECURITY DEFINER` public functions granted to `service_role` only; store only the returned secret id in your table. Never log the plaintext.

## Provisioning via Management API (no local Docker needed)
- Apply migrations: `POST https://api.supabase.com/v1/projects/{ref}/database/query` with `{"query": "<SQL>"}` and a `User-Agent` header (Cloudflare blocks default urllib → error 1010; use curl or set UA).
- Fetch keys: `GET /v1/projects/{ref}/api-keys?reveal=true`.
- Create confirmed users: `POST {url}/auth/v1/admin/users` with `email_confirm:true`.
