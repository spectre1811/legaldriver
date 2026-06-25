"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";
import { logActivity } from "@/lib/activity";

export type ActionResult = { ok: boolean; message: string };

export async function addCalendarEntry(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const title = String(formData.get("title") ?? "").trim();
  const date = String(formData.get("event_date") ?? "").trim();
  const kind = String(formData.get("kind") ?? "event").trim() || "event";
  const matterId = String(formData.get("matter_id") ?? "").trim();
  if (!title) return { ok: false, message: "Title is required." };
  if (!date) return { ok: false, message: "Pick a date." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };

  const { error } = await supabase.from("calendar_event").insert({
    tenant_id: tenantId,
    title,
    event_date: date,
    kind,
    matter_id: matterId || null,
    created_by: user?.id ?? null,
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/calendar");
  return { ok: true, message: `Added “${title}” on ${date}.` };
}

// Delete a MANUAL calendar entry only. RLS scopes the delete to the caller's
// tenant; we also filter by tenant_id explicitly. Derived events (hearings,
// deadlines, IP renewals) are NOT deletable here — they belong to their source
// record and are removed on the case / IP page.
export async function deleteCalendarEvent(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, message: "Missing event id." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };

  // Read first so we can record what was removed (and confirm it's ours).
  const { data: existing } = await supabase
    .from("calendar_event")
    .select("id, title, event_date, matter_id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!existing) return { ok: false, message: "Entry not found." };

  const { error } = await supabase
    .from("calendar_event")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, message: error.message };

  await logActivity(supabase, tenantId, {
    matterId: existing.matter_id,
    actorId: user?.id ?? null,
    type: "calendar_event.deleted",
    summary: `Deleted calendar entry “${existing.title}” (${existing.event_date}).`,
    meta: { id: existing.id },
  });

  revalidatePath("/dashboard/calendar");
  return { ok: true, message: `Deleted “${existing.title}”.` };
}
