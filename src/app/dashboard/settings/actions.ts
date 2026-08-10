"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/court/sync";
import { parseBarNumber, stateBarCouncil } from "@/lib/court/bar-number";
import { normalizeE164 } from "@/lib/phone";
import { recordConsent, recordOptOut } from "@/lib/services/messaging/consent";
import { AVATAR_BUCKET } from "@/lib/profile/avatar";

export type ActionResult = { ok: boolean; message: string };

const AVATAR_MAX_BYTES = 1_000_000; // 1 MB — the client crops to a square JPEG first; this is the guard.
const AVATAR_MIME = /^image\/(jpeg|png|webp)$/;

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
  // WO-61: the guided form submits `mode` — "fetch" (primary: pull the eCourts roster) or
  // "name-only" (secondary: cause-list alerts only). "fetch" REQUIRES a parseable enrolment
  // with year (founder ruling 2026-07-06) so we never accept a year-less number that dead-ends
  // at "0 cases — go back and add the year" only after a 60s onboarding run.
  const mode = String(formData.get("mode") ?? "fetch").trim();
  if (!name) return { ok: false, message: t("form.nameRequired") };
  const parsed = parseBarNumber(rawBar);
  if (mode !== "name-only" && !parsed) return { ok: false, message: t("form.needsEnrolment") };
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

// WO-147 W4 — profile photo upload. The `documents` bucket + service-role upload/signed-URL
// is the app's established storage pattern (docs/mail/voice all use it); `profile.photo_url`
// already exists (0031). Path is tenant+user scoped so one advocate's photo can never collide
// with or leak into another's. The client crops to a square JPEG ≤1 MB before sending; we still
// validate mime + size server-side (trust boundary — the client is not the guard). No new bucket,
// no migration.
export async function uploadAvatar(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const t = await getTranslations("settings");
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const tenantId = await getTenantId(supabase);
  if (!user || !tenantId) return { ok: false, message: t("form.noTenant") };

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: t("profile.photoNone") };
  if (!AVATAR_MIME.test(file.type)) return { ok: false, message: t("profile.photoType") };
  if (file.size > AVATAR_MAX_BYTES) return { ok: false, message: t("profile.photoBig") };

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `avatars/${tenantId}/${user.id}/${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const admin = createAdminClient();

  // Remove the previous object so old avatars don't accumulate (best-effort; a leftover is harmless).
  const { data: prev } = await supabase.from("profile").select("photo_url").eq("id", user.id).maybeSingle();
  if (prev?.photo_url) await admin.storage.from(AVATAR_BUCKET).remove([prev.photo_url]).catch(() => {});

  const { error: upErr } = await admin.storage
    .from(AVATAR_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true });
  if (upErr) return { ok: false, message: upErr.message };

  const { error } = await supabase.from("profile").update({ photo_url: path }).eq("id", user.id);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard", "layout"); // refresh the top-bar avatar without a reload
  return { ok: true, message: t("profile.photoSaved") };
}

export async function removeAvatar(): Promise<ActionResult> {
  const t = await getTranslations("settings");
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: t("form.noTenant") };

  const { data: prev } = await supabase.from("profile").select("photo_url").eq("id", user.id).maybeSingle();
  if (prev?.photo_url) await createAdminClient().storage.from(AVATAR_BUCKET).remove([prev.photo_url]).catch(() => {});

  const { error } = await supabase.from("profile").update({ photo_url: null }).eq("id", user.id);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: t("profile.photoRemoved") };
}

// Upsert the signed-in user's notification preferences (RLS: id = auth.uid()). WO-30 W2.
// Delivery wiring (WhatsApp/SMS) lands with WO-04/WO-17; this persists the intent.
export async function updateNotificationPrefs(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const t = await getTranslations("settings");
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const tenantId = await getTenantId(supabase);
  if (!user || !tenantId) return { ok: false, message: t("form.noTenant") };

  // Canonicalise the WhatsApp number to E.164 so the cron never sends to garbage.
  // Empty is fine (channel just stays dark); a present-but-invalid number is rejected.
  const rawWa = String(formData.get("whatsapp_number") ?? "").trim();
  const whatsappNumber = rawWa ? normalizeE164(rawWa) : null;
  if (rawWa && !whatsappNumber) return { ok: false, message: t("notify.invalidPhone") };
  const channelWhatsapp = formData.get("channel_whatsapp") === "on";

  // WO-144 W2: prior prefs, to detect the consent transitions (grant / revoke).
  const { data: prior } = await supabase
    .from("notification_prefs")
    .select("whatsapp_number, channel_whatsapp")
    .eq("id", user.id)
    .maybeSingle();

  const time = (k: string) => (String(formData.get(k) ?? "").trim() || null);
  const { error } = await supabase.from("notification_prefs").upsert({
    id: user.id,
    tenant_id: tenantId,
    whatsapp_number: whatsappNumber,
    channel_whatsapp: channelWhatsapp,
    channel_email: formData.get("channel_email") === "on",
    channel_sms: formData.get("channel_sms") === "on",
    quiet_start: time("quiet_start"),
    quiet_end: time("quiet_end"),
    cause_list_time: time("cause_list_time") ?? "07:00",
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, message: error.message };

  // WO-144 W2 consent ledger — best-effort: a ledger write failure must NOT fail
  // the settings save. Safe because the send gate fails closed anyway: no open
  // grant means no send, so a missed grant only delays delivery (retried on the
  // next save), never over-sends.
  try {
    const priorNumber = prior?.whatsapp_number ?? null;
    const priorOn = Boolean(prior?.channel_whatsapp);
    if (whatsappNumber && channelWhatsapp && (priorNumber !== whatsappNumber || !priorOn)) {
      await recordConsent(supabase, { tenantId, number: whatsappNumber, purpose: "service", source: "settings/notifications" });
    }
    if (priorNumber && (!channelWhatsapp || !whatsappNumber || whatsappNumber !== priorNumber)) {
      // Scoped to 'service': a settings channel-off must not close marketing grants.
      await recordOptOut(supabase, priorNumber, "service");
    }
  } catch {
    // Swallowed by design — see above.
  }

  revalidatePath("/dashboard/settings");
  // WO-336: the Notifications page's Quiet-hours/Evening-brief block now submits through this
  // SAME action (never a forked mutation) — revalidate it too, or a save there shows stale values
  // until an unrelated navigation happens to refresh the route cache.
  revalidatePath("/dashboard/notifications");
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
