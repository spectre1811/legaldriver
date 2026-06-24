"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";

export type ActionResult = { ok: boolean; message: string };

// Create a notice in 'awaiting_response'. next_escalation_at = response_due, so
// the escalation cron advances it if there's no response by then.
export async function createNotice(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const type = String(formData.get("type") ?? "").trim();
  const responseDue = String(formData.get("response_due") ?? "").trim();
  const matterId = String(formData.get("matter_id") ?? "").trim();
  if (!type) return { ok: false, message: "Notice type is required." };
  if (!responseDue) return { ok: false, message: "Response-due date is required." };

  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };

  const nextEscalation = new Date(`${responseDue}T17:00:00Z`).toISOString();
  const { data, error } = await supabase
    .from("notice")
    .insert({
      tenant_id: tenantId,
      matter_id: matterId || null,
      type,
      sent_at: new Date().toISOString(),
      response_due: responseDue,
      escalation_state: "awaiting_response",
      next_escalation_at: nextEscalation,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: error?.message ?? "Insert failed." };

  await supabase.from("audit_event").insert({
    tenant_id: tenantId,
    action: "notice.create",
    entity: "notice",
    entity_id: data.id,
    after: { type, response_due: responseDue, state: "awaiting_response" },
  });
  revalidatePath("/dashboard/notices");
  return { ok: true, message: `Notice "${type}" created — escalates if no response by ${responseDue}.` };
}

// Mark a notice as responded (stops escalation).
export async function markResponded(noticeId: string): Promise<ActionResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };
  await supabase
    .from("notice")
    .update({ escalation_state: "responded", next_escalation_at: null })
    .eq("id", noticeId);
  await supabase.from("audit_event").insert({
    tenant_id: tenantId,
    action: "notice.responded",
    entity: "notice",
    entity_id: noticeId,
  });
  revalidatePath("/dashboard/notices");
  return { ok: true, message: "Marked responded." };
}
