"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";

export type ViewResult = { ok: boolean; message: string };

// Persist the current console filter/sort state as a named saved view (kind='cases').
// RLS scopes reads/writes to the tenant; we still set tenant_id explicitly.
export async function saveView(name: string, query: Record<string, string>): Promise<ViewResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, message: "Give the view a name." };

  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };

  const { data: auth } = await supabase.auth.getUser();

  const { error } = await supabase.from("saved_view").insert({
    tenant_id: tenantId,
    user_id: auth.user?.id ?? null,
    kind: "cases",
    name: trimmed,
    query,
  });
  if (error) return { ok: false, message: "Could not save the view." };

  revalidatePath("/dashboard/cases");
  return { ok: true, message: `Saved “${trimmed}”.` };
}

export async function deleteView(id: string): Promise<ViewResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };

  const { error } = await supabase
    .from("saved_view")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("kind", "cases");
  if (error) return { ok: false, message: "Could not delete the view." };

  revalidatePath("/dashboard/cases");
  return { ok: true, message: "View removed." };
}
