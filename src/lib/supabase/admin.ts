import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";

// Service-role client: BYPASSES RLS. Server-only — never import into client code.
// Use only in trusted server contexts (cron jobs, webhooks) and always scope
// queries by tenant_id explicitly, since RLS won't do it for you here.
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      // Next.js caches fetch() by default; supabase-js uses fetch internally, so
      // without this every query could be served stale from the Data Cache.
      global: { fetch: (url, opts) => fetch(url, { ...opts, cache: "no-store" }) },
    },
  );
}

type Tables = Database["public"]["Tables"];

// Every table below carries a `tenant_id` column — derived straight from the generated
// schema types, not a hand-maintained list, so a new tenant-owned table is covered the
// moment `npm run db:types` regenerates them. Tables WITHOUT tenant_id (`tenant`,
// `court_cache`, `court_provider_health`, `access_requests`, the `corpus_*` ingest
// tables, `legal_reference`) are deliberately excluded — adminFor() only ever narrows
// on a column that actually exists, so calling `.from()` on one of those still needs
// the raw client (`.raw` below).
export type TenantTable = {
  [K in keyof Tables]: Tables[K]["Row"] extends { tenant_id: string } ? K : never;
}[keyof Tables];

function stampTenant<T extends Record<string, unknown>>(row: T, tenantId: string): T & { tenant_id: string } {
  return { ...row, tenant_id: tenantId };
}

// The caller never supplies tenant_id on an insert/upsert through adminFor() — it's
// stamped on automatically — so the input type makes it optional (postgrest's own
// generated `Insert` type requires it, since a bare admin client has no other way to
// get it there).
type InsertInput<T extends TenantTable> = Omit<Tables[T]["Insert"], "tenant_id"> & { tenant_id?: string };

// Supabase's generated client types every table's columns/filters against the SPECIFIC
// literal table name passed to `.from(...)`. Once that name is behind our own generic
// `T extends TenantTable` (necessarily, since one `from()` here serves every tenant
// table), TypeScript can no longer distribute that resolution through the chain — so
// the internals below thread through a structurally-typed `unknown`-column helper and
// cast back to the caller-facing shape. The external surface (what a call site sees:
// select columns, insert/update payload shapes, chainable filters) stays fully typed;
// only this file's own plumbing is loosely typed.
function eqTenant<Q>(builder: Q, tenantId: string): Q {
  return (builder as unknown as { eq: (column: "tenant_id", value: string) => unknown }).eq(
    "tenant_id",
    tenantId,
  ) as Q;
}

// postgrest-js parses a `.select(columns)` string AT THE TYPE LEVEL (recursive template-
// literal types) to narrow the returned row shape to exactly the requested columns. That
// parser is only cheap for a LITERAL columns string; fed a generic/abstract one (as it
// would be if this wrapper's `columns` parameter were itself generic) it recurses without
// bound and OOMs `tsc`. So `select()` below passes the REAL columns string through at
// runtime (the network request is unaffected) but statically casts it to the literal
// `"*"` so the parser only ever evaluates that one cheap case — the STATIC row type is
// always the full `Row` shape. That's a one-directional imprecision (a caller narrowing
// to 2 columns sees all of them typed as present) — acceptable here since the property
// this wrapper exists to guarantee is the tenant filter, not column-level typing.

/**
 * WO-364 W1 — tenant-scoped admin wrappers. The plain service-role client
 * (`createAdminClient()`) bypasses RLS entirely; a cron/webhook that forgets one
 * `.eq("tenant_id", …)` on it leaks another tenant's rows into the response or the
 * write (the WO-264 class of bug). `adminFor(tenantId)` makes that filter structural
 * instead of a discipline every call site has to remember on its own: every
 * select/update/delete on a tenant-owned table is pre-scoped to `tenantId`, and every
 * insert/upsert is tenant-stamped, before the caller chains its own additional filters
 * (`.eq("id", …)`, `.order(…)`, `.select().single()`, …) exactly as it did against the
 * raw client.
 *
 * `.raw` is the escape hatch — the unscoped admin client, for genuinely cross-tenant
 * work (a cron's own fan-out SELECT across every tenant before it knows which tenant a
 * row belongs to, or a table with no `tenant_id` at all, e.g. `court_provider_health`).
 * The ESLint rule (`eslint-plugin-local-rules/no-bare-admin-from.js`, advisory) flags a
 * bare `.from()` on the admin client elsewhere as a nudge to justify it, not to forbid it.
 */
export function adminFor(tenantId: string, client: SupabaseClient<Database> = createAdminClient()) {
  const admin = client;
  return {
    raw: admin,
    from<T extends TenantTable>(table: T) {
      return {
        select: (columns?: string) => eqTenant(admin.from(table).select(columns as "*"), tenantId),
        insert: (values: InsertInput<T> | InsertInput<T>[]) =>
          admin.from(table).insert(
            (Array.isArray(values) ? values.map((v) => stampTenant(v, tenantId)) : stampTenant(values, tenantId)) as never,
          ),
        upsert: (
          values: InsertInput<T> | InsertInput<T>[],
          opts?: { onConflict?: string; ignoreDuplicates?: boolean },
        ) =>
          admin.from(table).upsert(
            (Array.isArray(values) ? values.map((v) => stampTenant(v, tenantId)) : stampTenant(values, tenantId)) as never,
            opts,
          ),
        update: (values: Tables[T]["Update"]) => eqTenant(admin.from(table).update(values as never), tenantId),
        delete: () => eqTenant(admin.from(table).delete(), tenantId),
      };
    },
  };
}
