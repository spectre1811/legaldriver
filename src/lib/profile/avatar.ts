import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// WO-147 W4 — the ONE place a stored avatar path becomes a renderable URL.
// Photos live in the existing private `documents` bucket under a tenant-scoped
// `avatars/<tenant>/<user>/...` prefix (no new bucket, no migration — the
// `profile.photo_url` column already exists, 0031). Read = a short-lived signed
// URL via the service-role client, exactly like document downloads. Returns null
// when there's no photo (→ initials fallback, never a fabricated silhouette).
export const AVATAR_BUCKET = "documents";
export const AVATAR_SIGN_TTL = 60 * 30; // 30 min — outlives a page render + a few navigations

export async function signAvatar(photoPath: string | null | undefined): Promise<string | null> {
  if (!photoPath) return null;
  const admin = createAdminClient();
  const { data } = await admin.storage.from(AVATAR_BUCKET).createSignedUrl(photoPath, AVATAR_SIGN_TTL);
  return data?.signedUrl ?? null;
}
