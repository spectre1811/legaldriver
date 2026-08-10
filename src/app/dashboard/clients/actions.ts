"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";
import { checkConflicts, type ConflictHit } from "@/lib/conflict";
import { logActivity } from "@/lib/activity";

export type IntakeResult = { ok: boolean; message: string; conflicts?: ConflictHit[] };

// Live conflict check for the intake form (called before creating the client).
export async function runConflictCheck(name: string): Promise<ConflictHit[]> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return [];
  return checkConflicts(supabase, tenantId, name);
}

// Distinct, trimmed, non-empty — the array fields written from the repeatable inputs.
function cleanList(values: FormDataEntryValue[]): string[] {
  return [...new Set(values.map((v) => String(v).trim()).filter(Boolean))];
}

// address / contact_person / notes / practice_area_id / preferred_language / referral_source /
// id_note / billing_type / billing_amount live in the `custom` jsonb — no migration (schema
// untouched). Only non-empty keys are stored so `custom` stays lean.
// `resolvedPracticeAreaId` wins when supplied (the wizard's free-text field, resolved against
// `practice_area` server-side — see resolvePracticeAreaId below); otherwise falls back to a
// direct `practice_area_id` in the form (the edit form's Combobox, unchanged).
function buildCustom(formData: FormData, resolvedPracticeAreaId?: string | null): Record<string, string> {
  const custom: Record<string, string> = {};
  const directPracticeAreaId = String(formData.get("practice_area_id") ?? "").trim();
  const practiceAreaId = resolvedPracticeAreaId ?? (directPracticeAreaId || undefined);
  const address = String(formData.get("address") ?? "").trim();
  const contactPerson = String(formData.get("contact_person") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const preferredLanguage = String(formData.get("preferred_language") ?? "").trim();
  const referralSource = String(formData.get("referral_source") ?? "").trim();
  const idNote = String(formData.get("id_note") ?? "").trim();
  const billingType = String(formData.get("billing_type") ?? "").trim();
  const billingAmount = String(formData.get("billing_amount") ?? "").trim();
  if (practiceAreaId) custom.practice_area_id = practiceAreaId;
  if (address) custom.address = address;
  if (contactPerson) custom.contact_person = contactPerson;
  if (notes) custom.notes = notes;
  if (preferredLanguage) custom.preferred_language = preferredLanguage;
  if (referralSource) custom.referral_source = referralSource;
  if (idNote) custom.id_note = idNote;
  if (billingType) custom.billing_type = billingType;
  if (billingAmount) custom.billing_amount = billingAmount;
  return custom;
}

// The wizard's Step 2 "Practice area" is free text + datalist suggestions (prototype fidelity,
// WO-347), not a strict FK picker — but practice_area stays a real relational table (used
// elsewhere for filtering/reporting), so we resolve free text onto it rather than discarding the
// link: reuse a same-tenant case-insensitive match, else create one. No schema change (existing
// tenant-scoped table, RLS-safe insert).
async function resolvePracticeAreaId(supabase: ReturnType<typeof createClient>, tenantId: string, freeText: string): Promise<string | undefined> {
  const name = freeText.trim();
  if (!name) return undefined;
  const { data: existing } = await supabase.from("practice_area").select("id").eq("tenant_id", tenantId).ilike("name", name).limit(1);
  if (existing?.[0]) return existing[0].id;
  const { data: created } = await supabase.from("practice_area").insert({ tenant_id: tenantId, name }).select("id").single();
  return created?.id;
}

export async function addClient(_prev: IntakeResult, formData: FormData): Promise<IntakeResult> {
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "individual");
  const emails = cleanList(formData.getAll("email"));
  const phones = cleanList(formData.getAll("phone"));
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

  const practiceAreaText = String(formData.get("practice_area") ?? "").trim();
  const resolvedAreaId = practiceAreaText ? await resolvePracticeAreaId(supabase, tenantId, practiceAreaText) : undefined;

  const { data, error } = await supabase
    .from("client")
    .insert({
      tenant_id: tenantId,
      name,
      type: type === "org" ? "org" : "individual",
      emails,
      phones,
      custom: buildCustom(formData, resolvedAreaId),
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: error?.message ?? "Could not add client." };

  // Step 2's "Link matters" — retro-link existing, currently-uncliented matters to the new
  // client. `.is("client_id", null)` is a defensive guard so a race can never silently steal a
  // matter another request just assigned; tenant-scoped explicitly, not just via RLS.
  const linkIds = cleanList(formData.getAll("link_matter"));
  if (linkIds.length) {
    await supabase.from("matter").update({ client_id: data.id }).in("id", linkIds).eq("tenant_id", tenantId).is("client_id", null);
  }

  await logActivity(supabase, tenantId, { actorId: user?.id, type: "client.intake", summary: `Client “${name}” added`, meta: { conflicts: conflicts.length } });
  await supabase.from("audit_event").insert({ tenant_id: tenantId, actor_id: user?.id, action: "client.intake", entity: "client", entity_id: data.id, after: { name, conflicts: conflicts.length } });
  revalidatePath("/dashboard/clients");
  return { ok: true, message: `Added ${name}.` };
}

// Edit an existing client — all intake fields. Tenant-scoped: RLS confines the update to
// this tenant AND we filter explicitly by id. custom is REPLACED (the edit form carries
// every custom key), preserving any unmanaged keys by merging over the existing blob.
export async function updateClient(_prev: IntakeResult, formData: FormData): Promise<IntakeResult> {
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "individual");
  const emails = cleanList(formData.getAll("email"));
  const phones = cleanList(formData.getAll("phone"));
  if (!id) return { ok: false, message: "Missing client id." };
  if (!name) return { ok: false, message: "Client name is required." };

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };

  // Read the existing custom blob (RLS-scoped) so unmanaged keys survive the edit.
  const { data: existing } = await supabase.from("client").select("custom").eq("id", id).maybeSingle();
  if (!existing) return { ok: false, message: "Client not found." };
  const managed = new Set(["practice_area_id", "address", "contact_person", "notes"]);
  const existingCustom = (existing.custom && typeof existing.custom === "object" && !Array.isArray(existing.custom) ? existing.custom : {}) as Record<string, string>;
  const preserved = Object.fromEntries(Object.entries(existingCustom).filter(([k]) => !managed.has(k)));

  const { error } = await supabase
    .from("client")
    .update({
      name,
      type: type === "org" ? "org" : "individual",
      emails,
      phones,
      custom: { ...preserved, ...buildCustom(formData) },
    })
    .eq("id", id);
  if (error) return { ok: false, message: error.message };

  await logActivity(supabase, tenantId, { actorId: user?.id, type: "client.update", summary: `Client “${name}” updated` });
  await supabase.from("audit_event").insert({ tenant_id: tenantId, actor_id: user?.id, action: "client.update", entity: "client", entity_id: id, after: { name } });
  revalidatePath("/dashboard/clients");
  revalidatePath(`/dashboard/clients/${id}`);
  return { ok: true, message: `Saved ${name}.` };
}
