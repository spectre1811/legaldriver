"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: boolean; message: string };

// A portal client posts a message to their firm. RLS enforces sender='client' and
// that the tenant/client match the portal user's own mapping.
export async function sendClientMessage(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const body = String(formData.get("body") ?? "").trim();
  const matterId = String(formData.get("matter_id") ?? "").trim() || null;
  if (!body) return { ok: false, message: "Type a message." };

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };
  const { data: pu } = await supabase.from("portal_user").select("tenant_id, client_id").eq("id", user.id).maybeSingle();
  if (!pu) return { ok: false, message: "No portal access." };

  const { error } = await supabase.from("portal_message").insert({
    tenant_id: pu.tenant_id, client_id: pu.client_id, matter_id: matterId,
    sender: "client", sender_user_id: user.id, body,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/portal");
  return { ok: true, message: "Sent." };
}
