import { createClient as createSupabaseClient } from "@supabase/supabase-js";
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
