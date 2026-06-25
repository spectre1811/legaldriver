"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";
import { scheduleReminders } from "@/lib/notify/schedule";

export type ActionResult = { ok: boolean; message: string };

export async function addIpAsset(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const title = String(formData.get("title") ?? "").trim();
  const type = String(formData.get("type") ?? "trademark");
  const registration_no = String(formData.get("registration_no") ?? "").trim() || null;
  const jurisdiction = String(formData.get("jurisdiction") ?? "").trim() || null;
  const renewal_date = String(formData.get("renewal_date") ?? "").trim() || null;
  if (!title) return { ok: false, message: "Title is required." };

  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };

  const { data, error } = await supabase
    .from("ip_asset")
    .insert({ tenant_id: tenantId, title, type, registration_no, jurisdiction, renewal_date })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: error?.message ?? "Could not add." };

  // Reuse the reminder engine for the renewal date (T-3/T-1/day-of).
  if (renewal_date) {
    await scheduleReminders(supabase, tenantId, {
      kind: "ipr_renewal",
      eventDate: renewal_date,
      ref: `ip:${data.id}`,
      title: `${type} renewal — ${title}`,
    });
  }
  await supabase.from("audit_event").insert({ tenant_id: tenantId, action: "ip.add", entity: "ip_asset", entity_id: data.id, after: { title, type } });
  revalidatePath("/dashboard/ip");
  revalidatePath("/dashboard/calendar");
  return { ok: true, message: `Added ${title}.` };
}
