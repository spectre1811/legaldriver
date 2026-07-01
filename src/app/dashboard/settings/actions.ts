"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";

export type ActionResult = { ok: boolean; message: string };

export async function addAdvocate(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  const bar = String(formData.get("bar_registration_number") ?? "").trim().toUpperCase();
  const barCode = String(formData.get("bar_code") ?? "").trim().replace(/[^0-9]/g, "");
  const state = String(formData.get("state_code") ?? "").trim().toUpperCase();
  if (!name) return { ok: false, message: "Advocate name is required." };

  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };

  const { error } = await supabase.from("advocate").insert({
    tenant_id: tenantId,
    name,
    bar_registration_number: bar || null,
    bar_code: barCode || null,
    state_code: state || null,
  });
  if (error) return { ok: false, message: error.message };

  await supabase.from("audit_event").insert({
    tenant_id: tenantId,
    action: "advocate.add",
    entity: "advocate",
    after: { name, bar },
  });
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/calendar");
  return { ok: true, message: `Added advocate ${name}${bar ? ` (${bar})` : ""}.` };
}

// Delete an advocate (tenant-scoped via RLS), then audit.
export async function deleteAdvocate(id: string): Promise<ActionResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };

  const { error } = await supabase.from("advocate").delete().eq("id", id); // RLS scopes to tenant
  if (error) return { ok: false, message: error.message };

  await supabase.from("audit_event").insert({
    tenant_id: tenantId,
    action: "advocate.delete",
    entity: "advocate",
    entity_id: id,
  });
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/calendar");
  return { ok: true, message: "Deleted." };
}
