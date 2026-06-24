"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";

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
