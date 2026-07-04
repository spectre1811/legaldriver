"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";
import { checkConflicts, type ConflictHit } from "@/lib/conflict";
import { logActivity } from "@/lib/activity";
import { fetchClientsPage, type ClientRow } from "./clients-query";
import type { Page } from "@/lib/paginate";

export type IntakeResult = { ok: boolean; message: string; conflicts?: ConflictHit[] };

// Next keyset page for the clients list (WO-39). RLS scopes the read to the tenant.
export async function loadMoreClients(cursor: string): Promise<Page<ClientRow>> {
  const supabase = createClient();
  return fetchClientsPage(supabase, cursor);
}

// Live conflict check for the intake form (called before creating the client).
export async function runConflictCheck(name: string): Promise<ConflictHit[]> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return [];
  return checkConflicts(supabase, tenantId, name);
}

export async function addClient(_prev: IntakeResult, formData: FormData): Promise<IntakeResult> {
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "individual");
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const practiceAreaId = String(formData.get("practice_area_id") ?? "").trim();
  const acknowledged = String(formData.get("ack_conflicts") ?? "") === "1";
  if (!name) return { ok: false, message: "Client name is required." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };

  // Gate creation on conflict acknowledgement.
  const conflicts = await checkConflicts(supabase, tenantId, name);
  if (conflicts.length && !acknowledged) {
    return { ok: false, message: `Found ${conflicts.length} possible conflict(s) — review and confirm to proceed.`, conflicts };
  }

  const { data, error } = await supabase
    .from("client")
    .insert({
      tenant_id: tenantId,
      name,
      type: type === "org" ? "org" : "individual",
      emails: email ? [email] : [],
      phones: phone ? [phone] : [],
      custom: practiceAreaId ? { practice_area_id: practiceAreaId } : {},
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: error?.message ?? "Could not add client." };

  await logActivity(supabase, tenantId, { actorId: user?.id, type: "client.intake", summary: `Client “${name}” added`, meta: { conflicts: conflicts.length } });
  await supabase.from("audit_event").insert({ tenant_id: tenantId, actor_id: user?.id, action: "client.intake", entity: "client", entity_id: data.id, after: { name, conflicts: conflicts.length } });
  revalidatePath("/dashboard/clients");
  return { ok: true, message: `Added ${name}.` };
}
