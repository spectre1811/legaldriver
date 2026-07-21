// WO-264 · one recipient-resolution seam for every email-sending cron: the
// notification row's user when it has one, else the tenant owner. Extracted from
// cron/notify so the daily-hearings cron resolves recipients identically.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";

type AdminDB = SupabaseClient<Database>;

export async function resolveRecipientEmail(
  admin: AdminDB,
  tenantId: string,
  userId?: string | null,
): Promise<string | undefined> {
  if (userId) {
    const { data: u } = await admin.auth.admin.getUserById(userId);
    if (u.user?.email) return u.user.email;
  }
  const { data: owner } = await admin
    .from("profile")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();
  if (owner?.id) {
    const { data: u } = await admin.auth.admin.getUserById(owner.id);
    return u.user?.email ?? undefined;
  }
  return undefined;
}
