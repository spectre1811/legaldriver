// WO-264 · one recipient-resolution seam for every email-sending cron: the
// notification row's user when it has one, else the tenant owner. Extracted from
// cron/notify so the daily-hearings cron resolves recipients identically.
//
// WO-416: returns the resolved PROFILE id alongside the email — the id is the
// `notification_prefs` key (id = profile id = auth.uid()), so the send path can
// build a per-user unsubscribe token and honour channel_email suppression. The
// row's `user_id` IS the profile id, so it is returned as-is on the user branch.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";

type AdminDB = SupabaseClient<Database>;

export type Recipient = { email: string; profileId: string };

export async function resolveRecipientEmail(
  admin: AdminDB,
  tenantId: string,
  userId?: string | null,
): Promise<Recipient | undefined> {
  if (userId) {
    const { data: u } = await admin.auth.admin.getUserById(userId);
    if (u.user?.email) return { email: u.user.email, profileId: userId };
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
    if (u.user?.email) return { email: u.user.email, profileId: owner.id };
  }
  return undefined;
}
