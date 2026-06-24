import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";

// Thin wrappers over the Vault SQL helpers (service-role only). The plaintext
// token is passed once to store_secret and never persisted anywhere else; we
// keep only the returned secret id in oauth_connection.refresh_token_ref.
type Admin = SupabaseClient<Database>;

export async function storeSecret(admin: Admin, secret: string, name: string): Promise<string | null> {
  const { data, error } = await admin.rpc("store_secret", { secret, secret_name: name });
  if (error) return null;
  return (data as unknown as string) ?? null;
}

export async function readSecret(admin: Admin, secretId: string): Promise<string | null> {
  const { data, error } = await admin.rpc("read_secret", { secret_id: secretId });
  if (error) return null;
  return (data as unknown as string) ?? null;
}
