import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/db/database.types";

// Browser-side client (anon key, RLS-enforced). Safe for client components.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
