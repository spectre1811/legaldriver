"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";

export type ActionResult = { ok: boolean; message: string };

export async function addAdvocate(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const t = await getTranslations("settings");
  const name = String(formData.get("name") ?? "").trim();
  const bar = String(formData.get("bar_registration_number") ?? "").trim().toUpperCase();
  const barCode = String(formData.get("bar_code") ?? "").trim().replace(/[^0-9]/g, "");
  const state = String(formData.get("state_code") ?? "").trim().toUpperCase();
  if (!name) return { ok: false, message: t("form.nameRequired") };

  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: t("form.noTenant") };

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
  revalidatePath("/dashboard/onboarding"); // WO-16: advocate can be added/removed inline on the onboarding screen
  return { ok: true, message: t("form.added", { name: `${name}${bar ? ` (${bar})` : ""}` }) };
}

// Update the signed-in user's own profile (RLS: profile_update is id = auth.uid()). WO-30 W2.
export async function updateProfile(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const t = await getTranslations("settings");
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: t("form.noTenant") };

  const clean = (k: string) => (String(formData.get(k) ?? "").trim() || null);
  const { error } = await supabase
    .from("profile")
    .update({ full_name: clean("full_name"), phone: clean("phone"), designation: clean("designation"), chamber: clean("chamber") })
    .eq("id", user.id);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/settings");
  return { ok: true, message: t("profile.saved") };
}

// Upsert the signed-in user's notification preferences (RLS: id = auth.uid()). WO-30 W2.
// Delivery wiring (WhatsApp/SMS) lands with WO-04/WO-17; this persists the intent.
export async function updateNotificationPrefs(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const t = await getTranslations("settings");
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const tenantId = await getTenantId(supabase);
  if (!user || !tenantId) return { ok: false, message: t("form.noTenant") };

  const time = (k: string) => (String(formData.get(k) ?? "").trim() || null);
  const { error } = await supabase.from("notification_prefs").upsert({
    id: user.id,
    tenant_id: tenantId,
    whatsapp_number: String(formData.get("whatsapp_number") ?? "").trim() || null,
    channel_whatsapp: formData.get("channel_whatsapp") === "on",
    channel_email: formData.get("channel_email") === "on",
    channel_sms: formData.get("channel_sms") === "on",
    quiet_start: time("quiet_start"),
    quiet_end: time("quiet_end"),
    cause_list_time: time("cause_list_time") ?? "07:00",
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/settings");
  return { ok: true, message: t("notify.saved") };
}

// Delete an advocate (tenant-scoped via RLS), then audit.
export async function deleteAdvocate(id: string): Promise<ActionResult> {
  const t = await getTranslations("settings");
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: t("form.noTenant") };

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
  revalidatePath("/dashboard/onboarding"); // WO-16: advocate can be added/removed inline on the onboarding screen
  return { ok: true, message: t("form.deleted") };
}
