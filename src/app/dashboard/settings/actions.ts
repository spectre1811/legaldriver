"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";
import { parseBarNumber, stateBarCouncil } from "@/lib/court/bar-number";

export type ActionResult = { ok: boolean; message: string };

// WO-42: parse the ONE structured enrollment field (STATE/SERIAL/YEAR) + the chosen
// State Bar Council. We keep the canonical enrollment string (which INCLUDES the year —
// the field eCourts requires) in `bar_registration_number`, the numeric serial in
// `bar_code`, and — only for a verified council whose CNR prefix is known-correct — the
// state token in `state_code` (the cross-state guard). Unverified councils store no
// token (null) so the name-fallback never wrongly drops rows. (Persisting the parsed
// parts as their own typed columns is the founder-gated migration follow-up.)
export async function addAdvocate(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const t = await getTranslations("settings");
  const name = String(formData.get("name") ?? "").trim();
  const rawBar = String(formData.get("bar_registration_number") ?? "").trim().toUpperCase();
  const councilId = String(formData.get("state_bar_council") ?? "").trim().toUpperCase();
  if (!name) return { ok: false, message: t("form.nameRequired") };

  const parsed = parseBarNumber(rawBar);
  const council = stateBarCouncil(councilId);
  // Canonical enrollment string carries the year; fall back to the raw entry if unparsed.
  const barDisplay = parsed?.canonical ?? (rawBar || null);
  const barCode = parsed ? String(parsed.serial) : null;
  // Only a verified council carries a trustworthy CNR-prefix state token for the guard.
  const stateToken = council?.verified ? council.id : null;

  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: t("form.noTenant") };

  const { error } = await supabase.from("advocate").insert({
    tenant_id: tenantId,
    name,
    bar_registration_number: barDisplay,
    bar_code: barCode,
    state_code: stateToken,
  });
  if (error) return { ok: false, message: error.message };

  await supabase.from("audit_event").insert({
    tenant_id: tenantId,
    action: "advocate.add",
    entity: "advocate",
    after: { name, bar: barDisplay, council: council?.id ?? null },
  });
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard/onboarding"); // WO-16: advocate can be added/removed inline on the onboarding screen

  // Honest nudge: a chosen enrollment that we couldn't parse to a year won't get an
  // exact eCourts roster pull — tell the user rather than silently degrade to name search.
  if (rawBar && !parsed) {
    return { ok: true, message: t("form.addedNoYear", { name }) };
  }
  return { ok: true, message: t("form.added", { name: `${name}${barDisplay ? ` (${barDisplay})` : ""}` }) };
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
