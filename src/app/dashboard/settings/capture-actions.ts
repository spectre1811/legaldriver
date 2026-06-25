"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";

export type CaptureResult = { ok: boolean; message: string };

// Generate a fresh capture token (revoking any previous active one). The token
// authenticates the bookmarklet's POST to /api/court/capture.
export async function generateCaptureToken(): Promise<CaptureResult> {
  const sb = createClient();
  const tenantId = await getTenantId(sb);
  const { data: { user } } = await sb.auth.getUser();
  if (!tenantId) return { ok: false, message: "No tenant." };
  await sb.from("capture_token").update({ revoked: true }).eq("tenant_id", tenantId).eq("revoked", false);
  const { error } = await sb.from("capture_token").insert({ tenant_id: tenantId, created_by: user?.id ?? null, label: "bookmarklet" });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard/settings");
  return { ok: true, message: "Capture tool ready — drag the button to your bookmarks bar." };
}
