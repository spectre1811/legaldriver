"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCourtDataClient } from "@/lib/court/client";
import { getTenantId, upsertCase } from "@/lib/court/sync";

export type ActionResult = { ok: boolean; message: string };

export async function addCaseByCnr(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const cnr = String(formData.get("cnr") ?? "").trim().toUpperCase();
  if (cnr.length < 6) return { ok: false, message: "Enter a valid CNR (16 characters)." };

  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant — please sign in again." };

  const court = getCourtDataClient();
  let normalized;
  try {
    normalized = await court.getCaseByCNR(cnr);
  } catch {
    return { ok: false, message: "Court-data provider error. Try again shortly." };
  }
  if (!normalized) {
    return {
      ok: false,
      message: `No case found for ${cnr} via ${court.source}. You can add it manually instead.`,
    };
  }

  const { matterId, isNew, hearingCount } = await upsertCase(supabase, tenantId, normalized);

  await supabase.from("audit_event").insert({
    tenant_id: tenantId,
    action: isNew ? "case.add" : "case.resync",
    entity: "matter",
    entity_id: matterId,
    after: { cnr, source: normalized.source, hearings: hearingCount },
  });

  revalidatePath("/dashboard/cases");
  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard");
  return {
    ok: true,
    message: `${isNew ? "Added" : "Re-synced"} ${normalized.title} — next hearing ${
      normalized.nextHearingDate ?? "n/a"
    } (source: ${normalized.source}).`,
  };
}

export async function refreshCase(matterId: string): Promise<ActionResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };

  const { data: matter } = await supabase.from("matter").select("cnr").eq("id", matterId).single();
  if (!matter?.cnr) return { ok: false, message: "Matter has no CNR to refresh." };

  const court = getCourtDataClient();
  const [normalized] = await court.refreshCases([matter.cnr]);
  if (!normalized) return { ok: false, message: "Refresh returned nothing." };

  await upsertCase(supabase, tenantId, normalized);
  await supabase.from("audit_event").insert({
    tenant_id: tenantId,
    action: "case.refresh",
    entity: "matter",
    entity_id: matterId,
    after: { cnr: matter.cnr, source: normalized.source },
  });
  revalidatePath("/dashboard/cases");
  revalidatePath("/dashboard/calendar");
  return { ok: true, message: `Refreshed (source: ${normalized.source}).` };
}
